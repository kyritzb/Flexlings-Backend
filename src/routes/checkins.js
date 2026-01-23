const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const router = express.Router();

// POST /api/checkins
router.post('/checkins', async (req, res) => {
  try {
    const { mood_emoji, mood_label, sensory_levels, tags, notes } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid authorization token' });
    }

    const token = authHeader.substring(7);
    const authenticatedSupabase = createClient(
      env.supabaseUrl,
      env.supabaseKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: authError } =
      await authenticatedSupabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return res
        .status(401)
        .json({
          error: 'Invalid or expired token',
          details: authError?.message,
        });
    }

    const user_id = userData.user.id;
    if (!mood_emoji || !mood_label || !sensory_levels) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'mood_emoji, mood_label, and sensory_levels are required',
      });
    }

    const requiredSensoryFields = [
      'auditory',
      'visual',
      'social',
      'cognitive',
      'physical',
    ];
    for (const field of requiredSensoryFields) {
      if (
        typeof sensory_levels[field] !== 'number' ||
        sensory_levels[field] < 0 ||
        sensory_levels[field] > 5
      ) {
        return res
          .status(400)
          .json({
            error: 'Invalid sensory levels',
            details: `${field} must be a number between 0 and 5`,
          });
      }
    }

    const { data, error } = await authenticatedSupabase
      .from('user_checkins')
      .insert({
        user_id,
        mood_emoji,
        mood_label,
        sensory_auditory: sensory_levels.auditory,
        sensory_visual: sensory_levels.visual,
        sensory_social: sensory_levels.social,
        sensory_cognitive: sensory_levels.cognitive,
        sensory_physical: sensory_levels.physical,
        tags: tags || [],
        notes: notes || '',
      })
      .select()
      .single();

    if (error)
      return res
        .status(500)
        .json({ error: 'Failed to save check-in', details: error.message });

    res
      .status(201)
      .json({ message: 'Check-in saved successfully!', checkin: data });
  } catch (error) {
    console.error('Error in check-in endpoint:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/checkins
router.get('/checkins', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid authorization token' });
    }

    const token = authHeader.substring(7);
    const authenticatedSupabase = createClient(
      env.supabaseUrl,
      env.supabaseKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: authError } =
      await authenticatedSupabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return res
        .status(401)
        .json({
          error: 'Invalid or expired token',
          details: authError?.message,
        });
    }

    const user_id = userData.user.id;
    const { data, error } = await authenticatedSupabase
      .from('user_checkins')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error)
      return res
        .status(500)
        .json({ error: 'Failed to fetch check-ins', details: error.message });

    res.json({ checkins: data, count: data.length });
  } catch (error) {
    console.error('Error in get check-ins endpoint:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
