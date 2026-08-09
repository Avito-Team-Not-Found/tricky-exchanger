export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
export const PASSWORD_MIN_LENGTH = 8;

// пауза, после которой печать в поле считается законченной: дебаунс применяется к email-
// и password-полям форм авторизации, чтобы ошибка не вспыхивала на каждой букве
export const VALIDATE_DEBOUNCE_MS = 600;
