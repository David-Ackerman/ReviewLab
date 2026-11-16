export const appLocale = 'pt-BR';

export function projectOwnerLabel(name: string, isOwner: boolean, locale: string = appLocale) {
  if (!isOwner) return name;
  return /^en(?:-|$)/i.test(locale) ? 'You' : 'Você';
}
