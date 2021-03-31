'use strict';
const { parseMultipartData, sanitizeEntity } = require('strapi-utils');

module.exports = {
  
  /**
   * Create a publication
   */
  async create(ctx) {
    let entity;
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      data.owner = ctx.state.user.id;
      entity = await strapi.services.publication.create(data, { files });
    } else {
      const data = ctx.request.body;
      data.owner = ctx.state.user.id;
      entity = await strapi.services.publication.create(data);
    }
    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Update a publication
   */
  async update(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publication
    const publication = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    if (!publication) return ctx.unauthorized("You can't update this publication!");

    // Update publication
    let entity;
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      entity = await strapi.services.publication.update({ id }, data, { files });
    } else {
      entity = await strapi.services.publication.update({ id }, ctx.request.body );
    }

    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Delete a publication
   */
  async delete(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publication
    const publication = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    if (!publication) return ctx.unauthorized("You can't delete this publication!");

    // Delete publication
    await strapi.services.publication.delete({ id });

    return {
      result: 'Success',
      message: 'Publication deleted successfully!'
    };
  },

  /**
   * Retrieve publications
   */
  async find(ctx) {
    let entities;
    let query;

    // Fetch publications
    if (ctx.query._q) {
      query = ctx.query;
      query['owner.id'] = ctx.state.user.id;
      entities = await strapi.services.publication.search(query);
    } else {
      query = { 'owner.id': ctx.state.user.id }; 
      entities = await strapi.services.publication.find(query);
    }

    return entities.map((entity) => sanitizeEntity(entity, { model: strapi.models.publication }));
  },

  /**
   * Retrieve a publication
   */
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Preview publication
   */
   async preview(ctx) {
    
    // Fetch publisher
    const publishersQuery =  { slug: ctx.query.publisher };
    const publisher = await strapi.services.publisher.findOne(publishersQuery);
    if (!publisher) {
      ctx.status = 404;
      return ctx.send ({ 
        result: 'Error',
        message: 'Publisher not found!',  
      });
    }
    
    // Fetch publication
    const publicationsQuery = { 'owner.id': publisher.owner.id, slug: ctx.query.title };
    const publication = await strapi.services.publication.findOne(publicationsQuery);
    if (!publication) {
      ctx.status = 404;
      return ctx.send ({
        result: 'Error',
        message: 'Publication not found!',
      });
    }

    // Check if publication has a PDF file, royalty structure and wms account
    const allowed = publication.pdf_raw && publication.royalty_structure && publication.royalty_structure.wms_account;
    if (!allowed) {
      ctx.status = 404;
      return ctx.send ({
        result: 'Error',
        message: 'Publication not available of preview!',
      });
    }

    // Return data needed to preview publication
    return {
      title: publication.title,
      account: publication.royalty_structure.wms_account,
      pdf_url: publication.pdf_raw.url
    }
  },
};
