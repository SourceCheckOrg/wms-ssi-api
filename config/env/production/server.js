module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: 'https://wms-api.sourcecheck.org',
  admin: {
    auth: {
      secret: env('ADMIN_JWT_SECRET', '0f4a79c8f889a636aa8ff37bb9bcfca8'),
    },
  },
});