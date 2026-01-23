const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const supabase = createClient(env.supabaseUrl, env.supabaseKey);
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });
    if (authError) return res.status(401).json({ error: authError.message });

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    res.json({
      user: authData.user,
      session: authData.session,
      profile: profileData || null,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

router.post('/logout', async (_req, res) => {
  try {
    const supabase = createClient(env.supabaseUrl, env.supabaseKey);
    const { error } = await supabase.auth.signOut();
    if (error)
      return res
        .status(500)
        .json({ error: 'Failed to sign out', details: error.message });
    res.json({ message: 'Successfully signed out' });
  } catch (error) {
    console.error('Logout error:', error);
    res
      .status(500)
      .json({
        error: 'An error occurred during logout',
        details: error.message,
      });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, birthday } = req.body;
    if (!email || !password || !firstName || !lastName || !birthday) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const supabase = createClient(env.supabaseUrl, env.supabaseKey);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authError) return res.status(400).json({ error: authError.message });

    const birthdayDate = new Date(birthday).toISOString().split('T')[0];
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        birthday: birthdayDate,
      })
      .select()
      .single();

    if (profileError)
      return res
        .status(400)
        .json({
          error: 'Failed to create profile',
          details: profileError.message,
        });

    res.json({
      user: authData.user,
      session: authData.session,
      profile: profileData,
      message: 'Signup successful! Please check your email for verification.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    res
      .status(500)
      .json({
        error: 'An error occurred during signup',
        details: error.message,
      });
  }
});

module.exports = router;
