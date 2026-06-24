export const FIRST_SESSION_BOOKING_PATH = '/book?service=free&intent=first-session';
export const RETURNING_MEMBER_BOOKING_PATH = '/book?service=sessions_4';
export const MEMBER_SIGN_IN_PATH = '/sign-in/sign-in';
export const FIRST_SESSION_SIGN_UP_PATH = `/sign-up?redirect_url=${encodeURIComponent(FIRST_SESSION_BOOKING_PATH)}`;
export const ADMIN_SIGN_IN_PATH = '/sign-in-admin/sign-in';
export const ADMIN_DASHBOARD_PATH = '/admin/pulse';
