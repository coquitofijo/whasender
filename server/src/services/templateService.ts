export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}
