import bcrypt from "bcrypt";
import pool, { query } from "./config/db";

const BCRYPT_ROUNDS = 12;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || ["help", "--help", "-h"].includes(command)) {
    printHelp();
    process.exit(0);
  }

  if (command === "register" || command === "create-user") {
    const username = getArgValue(args, "--username", "-u");
    const email = getArgValue(args, "--email", "-e");
    const password = getArgValue(args, "--password", "-p");
    const role = getArgValue(args, "--role", "-r") || "operator";

    if (!username || !email || !password) {
      console.error("❌ Error: Username, email, and password are required.");
      console.log("\nUsage: node dist/cli.js register -u <username> -e <email> -p <password> [-r <role>]");
      process.exit(1);
    }

    try {
      // Check if user exists
      const checkExists = await query(
        "SELECT 1 FROM users WHERE username = $1 OR email = $2",
        [username.trim(), email.trim()]
      );

      if (checkExists.rowCount && checkExists.rowCount > 0) {
        console.error("❌ Error: Username or email already exists in database.");
        process.exit(1);
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const insertRes = await query(
        "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [username.trim(), email.trim(), passwordHash, role]
      );
      
      console.log(`\n✅ Success: User "${username}" registered successfully with role "${role}" (ID: ${insertRes.rows[0].id}).`);
    } catch (err: any) {
      console.error("❌ Database Error:", err.message);
      process.exit(1);
    }
  } else if (command === "reset-password") {
    const username = getArgValue(args, "--username", "-u");
    const password = getArgValue(args, "--password", "-p");

    if (!username || !password) {
      console.error("❌ Error: Username and new password are required.");
      console.log("\nUsage: node dist/cli.js reset-password -u <username> -p <new_password>");
      process.exit(1);
    }

    try {
      const userCheck = await query("SELECT id FROM users WHERE username = $1", [username.trim()]);
      if (userCheck.rowCount === 0) {
        console.error(`❌ Error: User "${username}" not found.`);
        process.exit(1);
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await query("UPDATE users SET password = $1 WHERE username = $2", [passwordHash, username.trim()]);

      console.log(`\n✅ Success: Password for user "${username}" has been reset successfully.`);
    } catch (err: any) {
      console.error("❌ Database Error:", err.message);
      process.exit(1);
    }
  } else {
    console.error(`❌ Error: Unknown command "${command}".`);
    printHelp();
    process.exit(1);
  }
}

function getArgValue(args: string[], longFlag: string, shortFlag: string): string | null {
  const index = args.findIndex(arg => arg === longFlag || arg === shortFlag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

function printHelp() {
  console.log("====================================================");
  console.log(" Hephaestus DevOps Portal CLI");
  console.log("====================================================");
  console.log("Usage:");
  console.log("  node dist/cli.js <command> [options]");
  console.log("\nCommands:");
  console.log("  register, create-user   Register a new portal user");
  console.log("  reset-password          Reset password for an existing user");
  console.log("\nRegister Options:");
  console.log("  -u, --username <name>   Username for the user");
  console.log("  -e, --email <email>     Email for the user");
  console.log("  -p, --password <pwd>    Password for the user");
  console.log("  -r, --role <role>       Role (ADMIN or operator, default: operator)");
  console.log("\nReset Password Options:");
  console.log("  -u, --username <name>   Username to reset password for");
  console.log("  -p, --password <pwd>    New password");
  console.log("\nExamples:");
  console.log("  node dist/cli.js register -u devops1 -e devops1@company.com -p SecretPass123");
  console.log("  node dist/cli.js reset-password -u devops1 -p NewPass456");
  console.log("====================================================");
}

main()
  .then(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Unhandled error:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
