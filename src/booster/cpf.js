export function cleanCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  if (dig !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  return dig === Number(cpf[10]);
}
