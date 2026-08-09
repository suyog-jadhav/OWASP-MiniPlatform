import { supabase } from './lib/supabase';
import { sha256 } from './lib/crypto';

async function main() {
  const email = 'player@ctf.local';
  const accessCode = 'TESTCODE1234';

  console.log('Setting up a test player...');

  // 1. Get or create an admin to associate with the event (if needed)
  const { data: admin } = await supabase.from('admins').select('id').limit(1).maybeSingle();

  // 2. Find or create a test event
  let eventId = '';
  const { data: existingEvent } = await supabase.from('events').select('id').limit(1).maybeSingle();

  if (existingEvent) {
    eventId = existingEvent.id;
    console.log(`Using existing event with ID: ${eventId}`);
  } else {
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week duration

    const { data: newEvent, error: eventError } = await supabase
      .from('events')
      .insert({
        name: 'Local Test CTF',
        description: 'A test event created automatically for local development testing.',
        start_time: startTime,
        end_time: endTime,
        status: 'active', // Set to active so player can login and view challenges
        created_by: admin?.id || null,
      })
      .select('id')
      .single();

    if (eventError || !newEvent) {
      console.error('Failed to create a test event:', eventError);
      process.exit(1);
    }
    eventId = newEvent.id;
    console.log(`Created new active test event with ID: ${eventId}`);
  }

  // 3. Find or create the player
  let playerId = '';
  const { data: existingPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existingPlayer) {
    playerId = existingPlayer.id;
    console.log(`Using existing player with ID: ${playerId}`);
  } else {
    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({
        email: email.toLowerCase(),
        name: 'Test Player',
      })
      .select('id')
      .single();

    if (playerError || !newPlayer) {
      console.error('Failed to create test player:', playerError);
      process.exit(1);
    }
    playerId = newPlayer.id;
    console.log(`Created new player with ID: ${playerId}`);
  }

  // 4. Register player for the event with the access code
  const codeHash = sha256(accessCode);
  const { error: eventPlayerError } = await supabase
    .from('event_players')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        code_hash: `${accessCode}:${codeHash}`,
        revoked: false,
      },
      { onConflict: 'event_id,player_id' }
    );

  if (eventPlayerError) {
    console.error('Failed to register player to event:', eventPlayerError);
    process.exit(1);
  }

  console.log('\n=========================================');
  console.log('TEST PLAYER SUCCESSFULLY CONFIGURED');
  console.log('=========================================');
  console.log(`1. Navigate to the player login page (usually /login).`);
  console.log(`2. If prompted for an Event ID, use:`);
  console.log(`   Event ID:    ${eventId}`);
  console.log(`3. Log in with these credentials:`);
  console.log(`   Email:       ${email}`);
  console.log(`   Access Code: ${accessCode}`);
  console.log('=========================================\n');
}

main();
