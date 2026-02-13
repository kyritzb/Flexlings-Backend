# Exercise Import Script

This script imports 30 essential exercises into your Supabase database.

## Quick Start

```bash
# From Flexlings-Backend directory
npm run import-exercises
```

## Setup Instructions

### 1. Get Your Supabase Service Role Key

The script needs the **service role key** (not the anon key) to bypass Row-Level Security (RLS) when inserting exercises.

**Get your key:**
1. Go to [Supabase Dashboard → Project Settings → API](https://supabase.com/dashboard/project/gltyfwjakywmudogihls/settings/api)
2. Find the **"service_role"** secret key
3. Copy it (it starts with `eyJhbGci...`)

### 2. Add to .env File

Open `Flexlings-Backend/.env` and add:

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your_key_here
```

### 3. Run the Script

```bash
cd Flexlings-Backend
npm run import-exercises
```

## What Gets Imported

The script imports **30 essential exercises** including:

- **Chest**: Bench press, push-ups, dumbbell press, incline press, cable crossover
- **Shoulders**: Overhead press, lateral raises, dumbbell press, face pulls
- **Back**: Deadlift, pull-ups, barbell rows, lat pulldowns
- **Arms**: Bicep curls, tricep dips, hammer curls, extensions
- **Legs**: Squats, lunges, leg press, Romanian deadlifts, hip thrusts, calf raises, leg curls
- **Core**: Planks, crunches, Russian twists

Each exercise includes:
- Name and body part
- Equipment required
- Target muscle
- Secondary muscles
- Step-by-step instructions
- Muscle engagement percentages

## Expected Output

```
========================================
🏋️  EXERCISE IMPORT SCRIPT
========================================
📦 Using static dataset (30 essential exercises)

💾 Importing exercises to database...

   ✓ Imported: Barbell Bench Press
   ✓ Imported: Push-up
   ✓ Imported: Dumbbell Bench Press
   ...

========================================
📊 IMPORT RESULTS
========================================
✅ Success: 30
❌ Failed: 0
📦 Total: 30

✅ Import complete!
```

## Troubleshooting

### Error: "new row violates row-level security policy"

**Cause**: Using ANON key instead of SERVICE_ROLE key

**Fix**: Make sure you're using the **service_role** secret key (not the anon public key) in your .env file

### Error: "SUPABASE_SERVICE_ROLE_KEY not configured"

**Fix**: Follow Setup Instructions above to add the service role key to `.env`

### Error: "duplicate key value violates unique constraint"

**Cause**: Exercises already exist in database

**Fix**: This is normal - the script uses `upsert` so it will update existing exercises. No action needed.

## Notes

- **API Ninjas is down**: The free tier exercise API is currently unavailable, so this script uses a curated static dataset of 30 essential exercises
- **Safe to re-run**: The script uses `upsert`, so running it multiple times won't create duplicates
- **Muscle engagement**: Each exercise automatically gets muscle engagement percentages calculated and stored
- **Service role key**: Keep this private - it bypasses all security rules!

## Next Steps

After importing exercises:
1. Test the workout quick-log page: `/workout/quick-log`
2. Search for exercises (e.g., "bench press", "squat")
3. Log your first workout!
