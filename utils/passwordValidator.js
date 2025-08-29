const PasswordValidator = require("password-validator");
const schema = new PasswordValidator();
schema
  .is().min(8)
  .is().max(128)
  .has().uppercase()
  .has().lowercase()
  .has().digits(1)
  .has().not().spaces()
  .is().not().oneOf([
    "password", "passw0rd", "password1",
    "123456","123456789","12345678","qwerty","abc123","111111"
  ]);

function containsSymbol(pw) {
  return /[^A-Za-z0-9]/.test(pw);
}

function containsUserInfo(pw, { username, email }) {
  const lower = (pw || "").toLowerCase();
  const u = (username || "").toLowerCase();
  const e = (email || "").toLowerCase();
  const local = e.includes("@") ? e.split("@")[0] : "";
  return (u && u.length >= 3 && lower.includes(u)) ||
         (local && local.length >= 3 && lower.includes(local)) ||
         (e && e.length >= 3 && lower.includes(e));
}


function validatePasswordUsingLib(password, { username, email } = {}) {
  const details = schema.validate(password, { details: true }); 
  const errors = [];

  if (details !== true) {
    for (const d of details) {
      switch (d.validation) {
        case "min": errors.push(`At least ${d.arguments[0]} characters`); break;
        case "max": errors.push(`No more than ${d.arguments[0]} characters`); break;
        case "uppercase": errors.push("Add at least one uppercase letter"); break;
        case "lowercase": errors.push("Add at least one lowercase letter"); break;
        case "digits": errors.push(`Add at least ${d.arguments[0] || 1} number`); break;
        case "spaces": errors.push("Remove spaces"); break;
        case "oneOf": errors.push("Avoid common/breached passwords"); break;
        default: errors.push(`Rule failed: ${d.validation}`);
      }
    }
  }

  // Custom symbol requirement
  if (!containsSymbol(password)) {
    errors.push("Add at least one symbol (e.g., @#$%&)");
  }

  // Custom rule: avoid using username/email
  if (containsUserInfo(password, { username, email })) {
    errors.push("Password must not contain your name or email");
  }

  return { valid: errors.length === 0, errors, details };
}

module.exports = {
  validatePasswordUsingLib,
};
