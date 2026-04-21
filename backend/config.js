module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'notebook-dev-secret-change-me',
  SALT_ROUNDS: 10
}
