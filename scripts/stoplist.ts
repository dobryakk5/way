const boundary = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'iu');
export const stopPatterns = [
 'бог(?:а|у|ом|е|и|ов|ам|ами|ах)?', 'грех(?:а|у|ом|е|и|ов|ам|ами|ах)?',
 'свят(?:ой|ая|ое|ые|ого|ому|ым|ых|ую|ою|ыми)?', 'молитв(?:а|ы|е|у|ой|ами|ах|ам)?',
 'церк(?:овь|ви|вей|овью|вям|вями|вях)?', 'храм(?:а|у|ом|е|ы|ов|ам|ами|ах)?', 'ра(?:й|я|ю|ем|е)', 'ад(?:а|у|ом|е)?'
].map(boundary);
export function forbiddenText(text: string): boolean { return stopPatterns.some(p => p.test(text)); }
