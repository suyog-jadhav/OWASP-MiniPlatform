import { supabase } from './lib/supabase';
import { hashPassword } from './lib/crypto';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@ctf.local';
  const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';

  console.log(`Creating admin account with email: ${email}...`);

  if (password.length < 12) {
    console.error('Error: Password must be at least 12 characters long.');
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);

  const { data, error } = await supabase
    .from('admins')
    .insert({
      email: email.toLowerCase(),
      password_hash: hashedPassword,
    })
    .select('id, email')
    .single();

  if (error) {
    console.error('Failed to create admin in database:', error);
    process.exit(1);
  }

  console.log('Successfully created admin account:');
  console.log(`- ID: ${data.id}`);
  console.log(`- Email: ${data.email}`);
  console.log(`- Password: ${password}`);
  console.log('\nNext steps:');
  console.log('1. Start your backend and frontend apps.');
  console.log('2. Go to the Admin Console login page on the frontend (e.g. /admin/login).');
  console.log('3. Enter the email and password to log in.');
}

main();
