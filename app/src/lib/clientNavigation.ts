export function historyPathFromRedirectUrl(value: string): string {
  const url = new URL(value, 'https://stryvsocietyfit.invalid');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Booking redirect must use HTTP or HTTPS.');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
