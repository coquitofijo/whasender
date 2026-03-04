export function phoneToJid(phone: string): string {
  const cleaned = phone.replace(/\D/g, '').replace(/^0+/, '');
  return `${cleaned}@s.whatsapp.net`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}
