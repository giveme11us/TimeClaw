export class UserError extends Error {
  constructor(message, { code = 'ERR', exitCode = 1, hint = null, next = null } = {}) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.exitCode = exitCode;
    this.hint = hint;
    this.next = next;
  }
}

export function asUserError(err, { action = null } = {}) {
  if (!err) return null;
  if (err instanceof UserError) return err;

  const code = err.code || err.errno || '';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return new UserError(
      action ? `Permission denied while ${action}.` : 'Permission denied.',
      {
        code: 'PERMISSION',
        exitCode: 5,
        hint: 'Check file permissions and ensure the destination is writable.'
      }
    );
  }

  return null;
}

export function formatUserError(err) {
  const lines = [];
  lines.push(`TimeClaw error: ${err.message}`);
  if (err.hint) lines.push(`Hint: ${err.hint}`);
  if (err.next) lines.push(`Next: ${err.next}`);
  return lines.join('\n');
}
