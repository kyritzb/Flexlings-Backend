const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { supabase } = require('../config/supabase');
const { env } = require('../config/env');
const { verifyTerraWebhookSignature } = require('../services/terra');

// Webhook
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['terra-signature'];
    const rawBody = req.body.toString();
    const body = JSON.parse(rawBody);

    if (
      env.terra.webhookSecret &&
      !verifyTerraWebhookSignature(rawBody, signature)
    ) {
      return res.status(401).json({ error: 'Invalid Terra signature' });
    }

    if (body.type && body.data) {
      if (body.user?.user_id) {
        try {
          await supabase.from('terra_data_payloads').insert({
            user_id: body.user.user_id,
            type: body.type,
            data: body.data,
            ts: new Date().toISOString(),
          });
          await supabase
            .from('terra_users')
            .update({ last_webhook_update: new Date().toISOString() })
            .eq('id', body.user.user_id);
        } catch (dbError) {
          console.error('Database error in Terra webhook:', dbError);
        }
      }
    } else if (
      body.user &&
      (body.type === 'auth' || body.type === 'connection')
    ) {
      try {
        await supabase
          .from('terra_users')
          .upsert({
            user_id: body.user.reference_id || body.user.user_id,
            provider: body.user.provider,
            last_webhook_update: new Date().toISOString(),
          })
          .select()
          .single();
      } catch (dbError) {
        console.error('Database error processing user connection:', dbError);
      }
    } else if (body.type === 'deauth' && body.user?.user_id) {
      try {
        await supabase.from('terra_users').delete().eq('id', body.user.user_id);
      } catch (dbError) {
        console.error('Database error processing deauth:', dbError);
      }
    } else {
      try {
        await supabase
          .from('terra_misc_payloads')
          .insert({ payload: body, received_at: new Date().toISOString() });
      } catch (dbError) {
        console.error('Error storing misc payload:', dbError);
      }
    }

    res.json({ message: 'Terra webhook received and processed' });
  } catch (error) {
    console.error('Error in Terra webhook:', error);
    res.status(500).json({ error: 'Failed to process Terra webhook' });
  }
});

// Initiate
router.get('/auth/initiate', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID is required' });

    const widgetResponse = await fetch(
      'https://api.tryterra.co/v2/auth/generateWidgetSession',
      {
        method: 'POST',
        headers: {
          'dev-id': env.terra.devId,
          'x-api-key': env.terra.apiKey || 'placeholder-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference_id: user_id,
          language: 'en',
          auth_success_redirect_url: 'myapp://auth/terra/callback',
          auth_failure_redirect_url:
            'myapp://auth/terra/callback?error=auth_failed',
        }),
      }
    );

    if (!widgetResponse.ok) {
      const errorData = await widgetResponse.text();
      return res
        .status(500)
        .json({
          error: 'Failed to create Terra widget session',
          details: errorData,
        });
    }

    const widgetData = await widgetResponse.json();
    res.json({
      auth_url: widgetData.url,
      session_id: widgetData.session_id,
      expires_in: widgetData.expires_in,
    });
  } catch (error) {
    console.error('Error initiating Terra authentication:', error);
    res
      .status(500)
      .json({
        error: 'Failed to initiate Terra authentication',
        details: error.message,
      });
  }
});

// Callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { session_id, error, reference_id } = req.query;
    if (error)
      return res
        .status(400)
        .json({ error: 'Terra authorization denied', details: error });
    if (!session_id && !reference_id)
      return res
        .status(400)
        .json({ error: 'Missing session_id or reference_id' });

    const { error: dbError } = await supabase
      .from('terra_users')
      .upsert({
        reference_id: reference_id || session_id,
        provider: 'PENDING',
        state: 'AUTHENTICATING',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError)
      return res
        .status(500)
        .json({ error: 'Failed to store Terra connection' });

    const redirectHtml = `<!DOCTYPE html><html><head><title>Redirecting...</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><script>location.href='myapp://auth/terra/callback?success=true';setTimeout(()=>{try{window.close()}catch(e){}},2000)</script></body></html>`;
    res.send(redirectHtml);
  } catch (error) {
    console.error('Error in Terra authentication callback:', error);
    res.status(500).json({ error: 'Failed to complete Terra authentication' });
  }
});

// Connection status
router.get('/connection/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data: connection, error } = await supabase
      .from('terra_users')
      .select('user_id, provider, created_at, reference_id')
      .eq('reference_id', user_id)
      .single();

    if (error && error.code !== 'PGRST116')
      return res.json({ connected: false });
    if (!connection) return res.json({ connected: false });
    res.json({
      connected: true,
      provider: connection.provider,
      connected_since: connection.created_at,
      terra_user_id: connection.user_id,
    });
  } catch (error) {
    console.error('Error checking Terra connection:', error);
    res.status(500).json({ error: 'Failed to check Terra connection' });
  }
});

// Data
router.get('/data/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { start_date, end_date } = req.query;
    const { data: connection, error: connectionError } = await supabase
      .from('terra_users')
      .select('user_id')
      .eq('reference_id', user_id)
      .single();
    if (connectionError || !connection)
      return res.status(404).json({ error: 'Terra connection not found' });

    const targetStartDate =
      start_date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    const targetEndDate = end_date || new Date().toISOString().split('T')[0];

    const { data: terraData, error: dataError } = await supabase
      .from('terra_data_payloads')
      .select('*')
      .eq('user_id', connection.user_id)
      .gte('ts', targetStartDate)
      .lte('ts', targetEndDate)
      .order('ts', { ascending: false });
    if (dataError)
      return res.status(500).json({ error: 'Failed to fetch Terra data' });

    const groupedData = {
      daily: terraData.filter((d) => d.type === 'daily') || [],
      sleep: terraData.filter((d) => d.type === 'sleep') || [],
      activity: terraData.filter((d) => d.type === 'activity') || [],
      body: terraData.filter((d) => d.type === 'body') || [],
    };
    res.json({ data: groupedData });
  } catch (error) {
    console.error('Error getting Terra data:', error);
    res
      .status(500)
      .json({ error: 'Failed to get Terra data', details: error.message });
  }
});

// Disconnect
router.delete('/connection/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { error: connectionError } = await supabase
      .from('terra_users')
      .delete()
      .eq('reference_id', user_id);
    if (connectionError)
      return res.status(500).json({ error: 'Failed to disconnect Terra' });

    try {
      const { data: terraUser } = await supabase
        .from('terra_users')
        .select('user_id')
        .eq('reference_id', user_id)
        .single();
      if (terraUser)
        await supabase
          .from('terra_data_payloads')
          .delete()
          .eq('user_id', terraUser.user_id);
    } catch (_cleanupError) {}

    res.json({ message: 'Terra disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting Terra:', error);
    res.status(500).json({ error: 'Failed to disconnect Terra' });
  }
});

// Get Terra sleep data (from cached payloads)
router.get('/sleep/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { date } = req.query;

    const { data: connection, error: connectionError } = await supabase
      .from('terra_users')
      .select('user_id')
      .eq('reference_id', user_id)
      .single();
    if (connectionError || !connection)
      return res.status(404).json({ error: 'Terra connection not found' });

    const targetStartDate =
      date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    const targetEndDate = date || new Date().toISOString().split('T')[0];

    const { data: sleepPayloads, error: dataError } = await supabase
      .from('terra_data_payloads')
      .select('*')
      .eq('user_id', connection.user_id)
      .eq('data_type', 'sleep')
      .gte('created_at', targetStartDate)
      .lte('created_at', `${targetEndDate}T23:59:59`)
      .order('created_at', { ascending: false });
    if (dataError)
      return res
        .status(500)
        .json({ error: 'Failed to fetch sleep data payloads' });

    if (!sleepPayloads || sleepPayloads.length === 0)
      return res.json({
        data: [],
        message: 'No sleep data available for the specified period',
      });

    const sleepDataWithPayloads = [];
    for (const payload of sleepPayloads) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('terra-payloads')
          .download(`sleep/${payload.payload_id}.json`);
        if (downloadError) continue;
        const jsonText = await fileData.text();
        const sleepData = JSON.parse(jsonText);
        sleepDataWithPayloads.push({ ...payload, payload_data: sleepData });
      } catch (_e) {}
    }

    res.json({
      data: sleepDataWithPayloads,
      count: sleepDataWithPayloads.length,
    });
  } catch (error) {
    console.error('Error getting Terra sleep data:', error);
    res
      .status(500)
      .json({
        error: 'Failed to get Terra sleep data',
        details: error.message,
      });
  }
});

// Historical sleep data (direct Terra API)
router.get('/historical/sleep/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { start_date, end_date } = req.query;

    const { data: connection, error: connectionError } = await supabase
      .from('terra_users')
      .select('user_id')
      .eq('user_id', user_id)
      .single();
    if (connectionError || !connection)
      return res.status(404).json({ error: 'Terra connection not found' });

    const targetStartDate =
      start_date ||
      new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    const targetEndDate = end_date || new Date().toISOString().split('T')[0];

    const urlParams = new URLSearchParams({
      user_id: connection.user_id,
      start_date: targetStartDate,
      end_date: targetEndDate,
      to_webhook: 'false',
      with_samples: 'true',
    });

    const terraResponse = await fetch(
      `https://api.tryterra.co/v2/sleep?${urlParams}`,
      {
        method: 'GET',
        headers: {
          'dev-id': env.terra.devId,
          'x-api-key': env.terra.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!terraResponse.ok) {
      const errorText = await terraResponse.text();
      if (terraResponse.status === 429)
        return res
          .status(429)
          .json({
            error: 'Rate limit exceeded. Please try again later.',
            retry_after: terraResponse.headers.get('retry-after'),
          });
      return res
        .status(terraResponse.status)
        .json({
          error: 'Failed to fetch historical sleep data from Terra',
          details: errorText,
        });
    }

    const terraData = await terraResponse.json();
    if (terraData.data && terraData.data.length > 0) {
      try {
        for (const sleepRecord of terraData.data) {
          const payloadId = crypto.randomUUID();
          const { error: uploadError } = await supabase.storage
            .from('terra-payloads')
            .upload(`sleep/${payloadId}.json`, JSON.stringify(sleepRecord), {
              contentType: 'application/json',
              upsert: true,
            });
          if (!uploadError) {
            await supabase.from('terra_data_payloads').upsert({
              user_id: connection.user_id,
              data_type: 'sleep',
              payload_id: payloadId,
              start_time: sleepRecord.start_time,
              end_time: sleepRecord.end_time,
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch (_cacheError) {}
    }

    const formattedData = (terraData.data || []).map((sleepRecord) => ({
      user_id: connection.user_id,
      data_type: 'sleep',
      payload_data: sleepRecord,
      start_time: sleepRecord.start_time,
      end_time: sleepRecord.end_time,
      created_at: new Date().toISOString(),
    }));
    res.json({
      data: formattedData,
      count: formattedData.length,
      source: 'terra_api',
      date_range: { start_date: targetStartDate, end_date: targetEndDate },
    });
  } catch (error) {
    console.error('Error in Terra historical sleep data:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch Terra historical sleep data',
        details: error.message,
      });
  }
});

// Historical backfill
router.post('/historical/backfill/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { days_back = 30 } = req.body || {};
    const { data: connection, error: connectionError } = await supabase
      .from('terra_users')
      .select('user_id, provider')
      .eq('reference_id', user_id)
      .single();
    if (connectionError || !connection)
      return res.status(404).json({ error: 'Terra connection not found' });

    const providerLimits = {
      GARMIN: 365 * 5,
      POLAR: 30,
      COROS: 90,
      HEALTH_CONNECT: 30,
      OURA: 365,
    };
    const maxDaysForProvider = providerLimits[connection.provider] || 30;
    const requestDays = Math.min(days_back, maxDaysForProvider);
    const startDate = new Date(Date.now() - requestDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    const useAsync = requestDays > 28;

    const backfillParams = new URLSearchParams({
      user_id: connection.user_id,
      start_date: startDate,
      end_date: endDate,
      to_webhook: useAsync.toString(),
      with_samples: 'true',
    });

    const terraResponse = await fetch(
      `https://api.tryterra.co/v2/sleep?${backfillParams}`,
      {
        method: 'GET',
        headers: {
          'dev-id': env.terra.devId,
          'x-api-key': env.terra.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!terraResponse.ok) {
      const errorText = await terraResponse.text();
      return res
        .status(terraResponse.status)
        .json({
          error: 'Failed to request Terra historical backfill',
          details: errorText,
        });
    }

    const result = await terraResponse.json();
    const terraReference = terraResponse.headers.get('terra-reference');
    res.json({
      message: useAsync
        ? 'Historical data backfill requested - data will arrive via webhooks'
        : 'Historical data backfill completed',
      request_type: useAsync ? 'asynchronous' : 'synchronous',
      days_requested: requestDays,
      provider_limit: maxDaysForProvider,
      date_range: { start_date: startDate, end_date: endDate },
      terra_reference: terraReference,
      data: useAsync ? null : result.data,
    });
  } catch (error) {
    console.error('Error in Terra historical backfill:', error);
    res
      .status(500)
      .json({
        error: 'Failed to request Terra historical backfill',
        details: error.message,
      });
  }
});

// Manual sync (no-op placeholder)
router.post('/sync/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { date } = req.body || {};
    const { data: connection, error: connectionError } = await supabase
      .from('terra_users')
      .select('user_id')
      .eq('reference_id', user_id)
      .single();
    if (connectionError || !connection)
      return res.status(404).json({ error: 'Terra connection not found' });
    const targetDate = date || new Date().toISOString().split('T')[0];
    res.json({
      message:
        'Sync requested - Terra will send data via webhooks automatically',
      date: targetDate,
      note: 'Data typically arrives within a few minutes via Terra webhooks',
    });
  } catch (error) {
    console.error('Error syncing Terra data:', error);
    res
      .status(500)
      .json({ error: 'Failed to sync Terra data', details: error.message });
  }
});

module.exports = router;
