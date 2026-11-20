// Prints a bcrypt hash for AUTH_PASSWORD_HASH, so the plain password never
// has to live in docker-compose.yml.
//   docker exec -it milemarker node src/auth/hash-password.js
//   node src/auth/hash-password.js 'my password'   (non-interactive)
import bcrypt from 'bcryptjs'
import readline from 'readline'

async function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Don't echo the password back to the terminal.
  rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s) }
  const answer = await new Promise((resolve) => rl.question(prompt, resolve))
  rl.close()
  process.stdout.write('\n')
  return answer
}

const password = process.argv[2] ?? (await ask('Password: '))
if (!password) { console.error('No password given'); process.exit(1) }
if (Buffer.byteLength(password) > 72) console.error('Warning: bcrypt only uses the first 72 bytes of a password.')
const hash = bcrypt.hashSync(password, 12)
console.log(hash)
console.error('\nIn docker-compose.yml, write each $ as $$ (Compose treats $ as a variable):')
console.error('  AUTH_PASSWORD_HASH: "' + hash.replace(/\$/g, '$$$$') + '"')
