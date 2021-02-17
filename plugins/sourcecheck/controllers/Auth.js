'use strict';

/**
 * SourceCheck Authentication controller (Auth.js)
 *
 * @description: Contains several actions used to sign up and sign in users using SSI.
 */

const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

module.exports = {

  // TODO action to sign user out

  /**
   * Action used to process a sign up request
   * Receives the username and email from the user, creates an inactive user and sends a confirmation token to user via email
   */
  signUp: async (ctx) => {

    const scAuthService = strapi.plugins["sourcecheck"].services.auth;
    
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.advanced.allow_register',
          message: 'Register action is currently disabled.',
        })
      );
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    // Email is required.
    if (!params.email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.provide',
          message: 'Please provide your email.',
        })
      );
    }

    // TODO define which role should be assigned to users not confirmed
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.role = role.id;
    
    // Check if there is already an user with the provided email
    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (user && user.provider === params.provider) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    if (user && user.provider !== params.provider && settings.unique_email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    try {
      params.confirmed = false;

      // Create user 
      const user = await strapi.query('user', 'users-permissions').create(params);

      const sanitizedUser = sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      });

      if (settings.email_confirmation) {
        try {
          await scAuthService.sendConfirmationEmail(user);
        } catch (err) {
          return ctx.badRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      // TODO should we already provide a temporary jwt token at this point?
      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? {
            id: 'Auth.form.error.username.taken',
            message: 'Username already taken',
          }
        : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

      ctx.badRequest(null, formatError(adminError));
    }
  },

  /**
   * Returns a Verifiable Presentation request containing the challenge sent to the user by email on sign up request
   */
  ssiSignUpRequest: async (ctx) => {
    const { confirmationToken } = ctx.request.body
    ctx.send({
      message: 'ok'
    });
  },

  /**
   * Process the Verifiable Presentation provided by the user
   * If the VP is valid, DID is associated with the user in the database and the user becomes active (confirmed = true)
   */
  ssiSignUp: async (ctx) => {
    // TODO use didkit node module to validate Verifiable Presentation
    const userService = strapi.plugins["users-permissions"].services.user;
    const { did, confirmationToken } = ctx.request.body
    console.log('ssiSignUp - did: ', did);
    console.log('ssiSignUp - confirmationToken: ', confirmationToken);
    
    // Check if there is already a not confirmed user
    const user = await strapi.query('user', 'users-permissions').findOne({ 
      confirmed: false,
      confirmationToken 
    });

    let jwt;

    if (user) {
      // Update user (attach DID and update confirmation fields)
      await userService.edit({ id: user.id }, { 
        did,
        confirmed: true,
        confirmationToken: '', 
      });

      jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
      console.log('ssiSignUp - jwt: ', jwt);
    }

    // Get socket id and send result to user web app
    strapi.redis.get(confirmationToken, (err, socketId) => {
      console.log('ssiSignUp - socketId: ', socketId);

      if (!err && jwt) {
        strapi.io.to(socketId).emit("jwt", jwt);
      }
    });

    ctx.send({
      message: 'ok'
    });
  },

  /**
   * Returns a Verifiable Presentation request containing to sign in the user
   */
  ssiSignInRequest: async (ctx) => {
    // Send 200 `ok`
    ctx.send({
      message: 'ok'
    });
  },

  /**
   * Process the Verifiable Presentation provided by the user
   * If the VP is valid and the DID is already associated with an active user, sends a JWT token to the user's web app 
   */
  ssiSignIn: async (ctx) => {
    // TODO use didkit node module to validate Verifiable Presentation
    const { did, challenge } = ctx.request.body
    
    const query = { 
      did,
      confirmed: true
    };
    const user = await strapi.query('user', 'users-permissions').findOne(query);

    // Check if the user is already registered
    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'vp-auth.error.not_registered',
          message: 'User not registered!',
        })
      );
    }

    const sanitizedUser = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

    // Get socket id and send result to user web app
    strapi.redis.get(challenge, (err, socketId) => {
      console.log('ssiSignUp - socketId: ', socketId);

      if (!err) {
        strapi.io.to(socketId).emit("jwt", jwt);
      }
    });

    return ctx.send({
      jwt,
      user: sanitizedUser,
    });
  },

  protectedRoute: async (ctx) => {
    ctx.send({
      message: 'Protected Route'
    });
  },

  unprotectedRoute: async (ctx) => {
    ctx.send({
      message: 'Unprotected Route'
    });
  }

};
