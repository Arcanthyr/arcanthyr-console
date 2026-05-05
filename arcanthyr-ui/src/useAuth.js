export function isAuthed() {
  return sessionStorage.getItem('arc_authed') === '1';
}

export function promptAuth() {
  const pw = window.prompt('Enter access password:');
  if (pw === 'Trustknowone1') {
    sessionStorage.setItem('arc_authed', '1');
    return true;
  }
  return false;
}

export function requireAuth() {
  if (isAuthed()) return true;
  return promptAuth();
}
