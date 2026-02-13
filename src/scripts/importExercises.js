/**
 * Exercise Import Script
 * Imports static exercise dataset to Supabase (API Ninjas is down for free users)
 *
 * Usage: node src/scripts/importExercises.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Check for required environment variables
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key_here') {
  console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY not configured\n');
  console.error('To get your service role key:');
  console.error('1. Go to: https://supabase.com/dashboard/project/gltyfwjakywmudogihls/settings/api');
  console.error('2. Copy the "service_role" secret key (NOT the anon key)');
  console.error('3. Add to Flexlings-Backend/.env:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your_key_here\n');
  process.exit(1);
}

// Initialize Supabase with SERVICE ROLE key (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role, not anon key
);

// Static exercise dataset (30 essential exercises)
const COMMON_EXERCISES = [
  // PUSH EXERCISES - CHEST
  {
    id: 'bench-press',
    name: 'Barbell Bench Press',
    bodyPart: 'chest',
    equipment: 'barbell',
    target: 'pectorals',
    secondaryMuscles: ['triceps', 'shoulders'],
    instructions: [
      'Lie flat on bench with feet on floor',
      'Grip bar slightly wider than shoulder width',
      'Lower bar to chest with control',
      'Press bar back up to starting position',
    ],
  },
  {
    id: 'pushup',
    name: 'Push-up',
    bodyPart: 'chest',
    equipment: 'body weight',
    target: 'pectorals',
    secondaryMuscles: ['triceps', 'shoulders', 'core'],
    instructions: [
      'Start in plank position with hands shoulder-width apart',
      'Lower body until chest nearly touches floor',
      'Push back up to starting position',
      'Keep core engaged throughout',
    ],
  },
  {
    id: 'dumbbell-press',
    name: 'Dumbbell Bench Press',
    bodyPart: 'chest',
    equipment: 'dumbbell',
    target: 'pectorals',
    secondaryMuscles: ['triceps', 'shoulders'],
    instructions: [
      'Lie on bench with dumbbell in each hand',
      'Start with weights at chest level',
      'Press weights up until arms extended',
      'Lower with control back to start',
    ],
  },
  {
    id: 'incline-press',
    name: 'Incline Barbell Press',
    bodyPart: 'chest',
    equipment: 'barbell',
    target: 'pectorals',
    secondaryMuscles: ['shoulders', 'triceps'],
    instructions: [
      'Set bench to 30-45 degree incline',
      'Grip bar slightly wider than shoulders',
      'Lower bar to upper chest',
      'Press back to starting position',
    ],
  },

  // PUSH EXERCISES - SHOULDERS
  {
    id: 'overhead-press',
    name: 'Overhead Press',
    bodyPart: 'shoulders',
    equipment: 'barbell',
    target: 'deltoids',
    secondaryMuscles: ['triceps', 'upper chest'],
    instructions: [
      'Stand with feet shoulder-width apart',
      'Start with bar at shoulder height',
      'Press bar overhead until arms extended',
      'Lower with control to shoulders',
    ],
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'Dumbbell Shoulder Press',
    bodyPart: 'shoulders',
    equipment: 'dumbbell',
    target: 'deltoids',
    secondaryMuscles: ['triceps'],
    instructions: [
      'Sit or stand with dumbbells at shoulder height',
      'Press weights overhead until arms extended',
      'Lower back to shoulder level',
    ],
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    bodyPart: 'shoulders',
    equipment: 'dumbbell',
    target: 'deltoids',
    secondaryMuscles: [],
    instructions: [
      'Stand with dumbbells at sides',
      'Raise arms out to sides until parallel to floor',
      'Lower with control',
      'Keep slight bend in elbows',
    ],
  },

  // PUSH EXERCISES - TRICEPS
  {
    id: 'tricep-dip',
    name: 'Tricep Dip',
    bodyPart: 'upper arms',
    equipment: 'body weight',
    target: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    instructions: [
      'Grip parallel bars and support body weight',
      'Lower body by bending elbows',
      'Push back up to starting position',
      'Keep elbows close to body',
    ],
  },
  {
    id: 'tricep-extension',
    name: 'Overhead Tricep Extension',
    bodyPart: 'upper arms',
    equipment: 'dumbbell',
    target: 'triceps',
    secondaryMuscles: [],
    instructions: [
      'Hold dumbbell overhead with both hands',
      'Lower weight behind head by bending elbows',
      'Extend arms back to starting position',
      'Keep elbows pointed forward',
    ],
  },

  // PULL EXERCISES - BACK
  {
    id: 'deadlift',
    name: 'Barbell Deadlift',
    bodyPart: 'back',
    equipment: 'barbell',
    target: 'erector spinae',
    secondaryMuscles: ['glutes', 'hamstrings', 'traps', 'forearms'],
    instructions: [
      'Stand with feet hip-width apart, bar over midfoot',
      'Grip bar just outside legs',
      'Keep back straight, chest up',
      'Drive through heels to stand up',
      'Lower bar with control',
    ],
  },
  {
    id: 'pullup',
    name: 'Pull-up',
    bodyPart: 'back',
    equipment: 'body weight',
    target: 'latissimus dorsi',
    secondaryMuscles: ['biceps', 'forearms', 'shoulders'],
    instructions: [
      'Hang from bar with overhand grip',
      'Pull body up until chin over bar',
      'Lower with control to full extension',
      'Keep core engaged',
    ],
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    bodyPart: 'back',
    equipment: 'barbell',
    target: 'latissimus dorsi',
    secondaryMuscles: ['rhomboids', 'traps', 'biceps'],
    instructions: [
      'Bend at hips with back straight',
      'Let bar hang at arms length',
      'Pull bar to lower chest/upper abs',
      'Lower with control',
    ],
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    bodyPart: 'back',
    equipment: 'cable',
    target: 'latissimus dorsi',
    secondaryMuscles: ['biceps', 'shoulders'],
    instructions: [
      'Sit at lat pulldown machine',
      'Grip bar wider than shoulder width',
      'Pull bar down to upper chest',
      'Return to starting position with control',
    ],
  },

  // PULL EXERCISES - BICEPS
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    bodyPart: 'upper arms',
    equipment: 'barbell',
    target: 'biceps',
    secondaryMuscles: ['forearms'],
    instructions: [
      'Stand with feet shoulder-width apart',
      'Hold bar with underhand grip',
      'Curl bar up to shoulders',
      'Lower with control',
      'Keep elbows stationary',
    ],
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    bodyPart: 'upper arms',
    equipment: 'dumbbell',
    target: 'biceps',
    secondaryMuscles: ['forearms'],
    instructions: [
      'Stand with dumbbells at sides',
      'Curl weights up to shoulders',
      'Lower with control',
      'Can alternate arms or do both together',
    ],
  },

  // LEGS - QUADS
  {
    id: 'back-squat',
    name: 'Barbell Back Squat',
    bodyPart: 'upper legs',
    equipment: 'barbell',
    target: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    instructions: [
      'Position bar on upper back',
      'Stand with feet shoulder-width apart',
      'Lower body by bending knees and hips',
      'Descend until thighs parallel to floor',
      'Drive through heels to stand',
    ],
  },
  {
    id: 'front-squat',
    name: 'Barbell Front Squat',
    bodyPart: 'upper legs',
    equipment: 'barbell',
    target: 'quadriceps',
    secondaryMuscles: ['glutes', 'core'],
    instructions: [
      'Rest bar on front of shoulders',
      'Keep elbows high and chest up',
      'Squat down keeping torso upright',
      'Drive back up to standing',
    ],
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    bodyPart: 'upper legs',
    equipment: 'machine',
    target: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    instructions: [
      'Sit in leg press machine',
      'Place feet shoulder-width on platform',
      'Lower weight by bending knees',
      'Press back up to starting position',
    ],
  },
  {
    id: 'lunge',
    name: 'Dumbbell Lunge',
    bodyPart: 'upper legs',
    equipment: 'dumbbell',
    target: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    instructions: [
      'Hold dumbbells at sides',
      'Step forward into lunge position',
      'Lower back knee toward ground',
      'Push back to starting position',
      'Alternate legs',
    ],
  },

  // LEGS - HAMSTRINGS & GLUTES
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    bodyPart: 'upper legs',
    equipment: 'barbell',
    target: 'hamstrings',
    secondaryMuscles: ['glutes', 'lower back'],
    instructions: [
      'Stand with feet hip-width apart',
      'Hold bar at thigh level',
      'Hinge at hips, pushing them back',
      'Lower bar down shins while keeping back straight',
      'Return to standing by driving hips forward',
    ],
  },
  {
    id: 'hip-thrust',
    name: 'Barbell Hip Thrust',
    bodyPart: 'upper legs',
    equipment: 'barbell',
    target: 'glutes',
    secondaryMuscles: ['hamstrings'],
    instructions: [
      'Sit on floor with upper back against bench',
      'Roll bar over hips',
      'Drive through heels, lifting hips up',
      'Squeeze glutes at top',
      'Lower with control',
    ],
  },

  // LEGS - CALVES
  {
    id: 'calf-raise',
    name: 'Standing Calf Raise',
    bodyPart: 'lower legs',
    equipment: 'body weight',
    target: 'calves',
    secondaryMuscles: [],
    instructions: [
      'Stand with balls of feet on edge of step',
      'Lower heels below step level',
      'Rise up onto toes as high as possible',
      'Lower back down with control',
    ],
  },

  // CORE
  {
    id: 'plank',
    name: 'Plank',
    bodyPart: 'waist',
    equipment: 'body weight',
    target: 'abdominals',
    secondaryMuscles: ['shoulders', 'glutes'],
    instructions: [
      'Start in push-up position',
      'Lower onto forearms',
      'Keep body in straight line',
      'Hold position, engaging core',
    ],
  },
  {
    id: 'crunch',
    name: 'Crunch',
    bodyPart: 'waist',
    equipment: 'body weight',
    target: 'abdominals',
    secondaryMuscles: [],
    instructions: [
      'Lie on back with knees bent',
      'Place hands behind head',
      'Curl shoulders up toward knees',
      'Lower back down with control',
    ],
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    bodyPart: 'waist',
    equipment: 'body weight',
    target: 'obliques',
    secondaryMuscles: ['abdominals'],
    instructions: [
      'Sit on floor with knees bent',
      'Lean back slightly, keeping back straight',
      'Rotate torso from side to side',
      'Touch floor on each side',
    ],
  },

  // Additional common exercises
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    bodyPart: 'upper legs',
    equipment: 'dumbbell',
    target: 'quadriceps',
    secondaryMuscles: ['glutes', 'core'],
    instructions: [
      'Hold dumbbell at chest height',
      'Stand with feet shoulder-width apart',
      'Squat down keeping chest up',
      'Drive back up to standing',
    ],
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    bodyPart: 'shoulders',
    equipment: 'cable',
    target: 'deltoids',
    secondaryMuscles: ['traps', 'rhomboids'],
    instructions: [
      'Attach rope to cable machine at face height',
      'Pull rope toward face',
      'Separate hands as you pull',
      'Return with control',
    ],
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    bodyPart: 'upper arms',
    equipment: 'dumbbell',
    target: 'biceps',
    secondaryMuscles: ['forearms'],
    instructions: [
      'Hold dumbbells with neutral grip',
      'Curl weights up keeping thumbs up',
      'Lower with control',
      'Keep elbows stationary',
    ],
  },
  {
    id: 'leg-curl',
    name: 'Leg Curl',
    bodyPart: 'upper legs',
    equipment: 'machine',
    target: 'hamstrings',
    secondaryMuscles: [],
    instructions: [
      'Lie face down on leg curl machine',
      'Place ankles under pad',
      'Curl legs up toward glutes',
      'Lower with control',
    ],
  },
  {
    id: 'cable-crossover',
    name: 'Cable Crossover',
    bodyPart: 'chest',
    equipment: 'cable',
    target: 'pectorals',
    secondaryMuscles: ['shoulders'],
    instructions: [
      'Set cables to high position',
      'Grab handles and step forward',
      'Bring hands together in front of chest',
      'Return with control',
    ],
  },
];

// Muscle group mappings
const MUSCLE_GROUP_MAPPINGS = {
  'chest': {
    chest: { percentage: 70, isPrimary: true },
    triceps: { percentage: 20, isPrimary: false },
    shoulders: { percentage: 10, isPrimary: false },
  },
  'shoulders': {
    shoulders: { percentage: 80, isPrimary: true },
    triceps: { percentage: 10, isPrimary: false },
    chest: { percentage: 10, isPrimary: false },
  },
  'back': {
    back: { percentage: 70, isPrimary: true },
    biceps: { percentage: 20, isPrimary: false },
    forearms: { percentage: 10, isPrimary: false },
  },
  'upper arms': {
    biceps: { percentage: 50, isPrimary: true },
    triceps: { percentage: 50, isPrimary: true },
  },
  'lower arms': {
    forearms: { percentage: 100, isPrimary: true },
  },
  'upper legs': {
    quads: { percentage: 40, isPrimary: true },
    hamstrings: { percentage: 35, isPrimary: true },
    glutes: { percentage: 25, isPrimary: false },
  },
  'lower legs': {
    calves: { percentage: 100, isPrimary: true },
  },
  'waist': {
    core: { percentage: 100, isPrimary: true },
  },
  'cardio': {
    cardio: { percentage: 100, isPrimary: true },
  },
  'neck': {
    neck: { percentage: 100, isPrimary: true },
  },
};

// Map to standardized muscle names
function mapToStandardMuscle(muscle) {
  const normalized = muscle.toLowerCase().trim();
  const mapping = {
    'pectorals': 'chest',
    'chest': 'chest',
    'delts': 'shoulders',
    'deltoids': 'shoulders',
    'shoulders': 'shoulders',
    'lats': 'back',
    'latissimus dorsi': 'back',
    'traps': 'back',
    'trapezius': 'back',
    'rhomboids': 'back',
    'erector spinae': 'back',
    'lower back': 'back',
    'upper back': 'back',
    'biceps': 'biceps',
    'biceps brachii': 'biceps',
    'triceps': 'triceps',
    'triceps brachii': 'triceps',
    'forearms': 'forearms',
    'brachioradialis': 'forearms',
    'quadriceps': 'quads',
    'quads': 'quads',
    'hamstrings': 'hamstrings',
    'glutes': 'glutes',
    'gluteus maximus': 'glutes',
    'gluteus medius': 'glutes',
    'calves': 'calves',
    'gastrocnemius': 'calves',
    'soleus': 'calves',
    'abs': 'core',
    'abdominals': 'core',
    'obliques': 'core',
    'core': 'core',
    'hip flexors': 'core',
    'serratus anterior': 'core',
    'adductors': 'quads',
    'abductors': 'glutes',
  };
  return mapping[normalized] || null;
}

// Calculate muscle engagement
function calculateMuscleEngagement(bodyPart, target, secondaryMuscles = []) {
  const baseEngagement = MUSCLE_GROUP_MAPPINGS[bodyPart.toLowerCase()] || {};
  const result = { ...baseEngagement };

  const targetMapped = mapToStandardMuscle(target);
  if (targetMapped && result[targetMapped]) {
    result[targetMapped].isPrimary = true;
    result[targetMapped].percentage = Math.min(100, result[targetMapped].percentage + 10);
  }

  secondaryMuscles.forEach(muscle => {
    const mapped = mapToStandardMuscle(muscle);
    if (mapped && !result[mapped]) {
      result[mapped] = { percentage: 15, isPrimary: false };
    }
  });

  const total = Object.values(result).reduce((sum, m) => sum + m.percentage, 0);
  if (total > 150) {
    const scale = 150 / total;
    Object.keys(result).forEach(key => {
      result[key].percentage = Math.round(result[key].percentage * scale);
    });
  }

  return result;
}

// Categorize exercise
function categorizeExercise(bodyPart, equipment, name) {
  const nameLower = name.toLowerCase();

  if (bodyPart === 'cardio') return 'cardio';
  if (nameLower.includes('olympic') || nameLower.includes('clean') || nameLower.includes('snatch')) {
    return 'olympic';
  }

  if (bodyPart === 'chest' || bodyPart === 'shoulders' ||
      (bodyPart === 'upper arms' && nameLower.includes('tricep'))) {
    return 'push';
  }

  if (bodyPart === 'back' ||
      (bodyPart === 'upper arms' && nameLower.includes('bicep'))) {
    return 'pull';
  }

  if (bodyPart === 'upper legs' || bodyPart === 'lower legs') {
    return 'legs';
  }

  if (bodyPart === 'waist') {
    return 'core';
  }

  return 'other';
}

// Import exercises to database
async function importExercisesToDatabase(exercises) {
  console.log('\n💾 Importing exercises to database...\n');

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i];

    try {
      // Insert exercise
      const { data: insertedExercise, error: exerciseError } = await supabase
        .from('exercises')
        .upsert({
          external_id: exercise.id,
          name: exercise.name,
          category: categorizeExercise(exercise.bodyPart, exercise.equipment, exercise.name),
          body_part: exercise.bodyPart,
          equipment: exercise.equipment,
          target_muscle: exercise.target,
          secondary_muscles: exercise.secondaryMuscles || [],
          gif_url: '',
          instructions: exercise.instructions || [],
        }, { onConflict: 'external_id' })
        .select()
        .single();

      if (exerciseError) {
        throw exerciseError;
      }

      // Calculate and insert muscle engagement
      const engagement = calculateMuscleEngagement(
        exercise.bodyPart,
        exercise.target,
        exercise.secondaryMuscles || []
      );

      const engagementRows = Object.entries(engagement).map(([muscle, data]) => ({
        exercise_id: insertedExercise.id,
        muscle_group: muscle,
        engagement_percentage: data.percentage,
        is_primary: data.isPrimary,
      }));

      const { error: engagementError } = await supabase
        .from('muscle_engagement')
        .upsert(engagementRows, { onConflict: 'exercise_id,muscle_group' });

      if (engagementError) {
        throw engagementError;
      }

      results.success++;
      console.log(`   ✓ Imported: ${exercise.name}`);
    } catch (error) {
      results.failed++;
      results.errors.push(`${exercise.name}: ${error.message}`);
      console.error(`   ❌ Failed: ${exercise.name} - ${error.message}`);
    }
  }

  return results;
}

// Main execution
async function main() {
  console.log('\n========================================');
  console.log('🏋️  EXERCISE IMPORT SCRIPT');
  console.log('========================================');
  console.log('📦 Using static dataset (30 essential exercises)');
  console.log('ℹ️  API Ninjas is currently down for free users\n');

  try {
    const results = await importExercisesToDatabase(COMMON_EXERCISES);

    console.log('\n========================================');
    console.log('📊 IMPORT RESULTS');
    console.log('========================================');
    console.log(`✅ Success: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📦 Total: ${COMMON_EXERCISES.length}`);

    if (results.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      results.errors.forEach(err => {
        console.log(`   - ${err}`);
      });
    }

    console.log('\n✅ Import complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
