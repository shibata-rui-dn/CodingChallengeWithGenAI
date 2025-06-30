import Joi from 'joi';
import { getConfig } from '../../config/configLoader.js';

const config = getConfig();

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  client_id: Joi.string().required(),
  redirect_uri: Joi.string().uri().required(),
  scope: Joi.string().valid(...config.oauth.default_scopes.join(' ').split(' ')),
  state: Joi.string()
});

const tokenSchema = Joi.object({
  grant_type: Joi.string().valid('authorization_code').required(),
  code: Joi.string().required(),
  client_id: Joi.string().required(),
  client_secret: Joi.string(),
  redirect_uri: Joi.string().uri().required()
});

const authorizeSchema = Joi.object({
  response_type: Joi.string().valid('code').required(),
  client_id: Joi.string().required(),
  redirect_uri: Joi.string().uri().required(),
  scope: Joi.string().valid(...config.oauth.default_scopes.join(' ').split(' ')),
  state: Joi.string()
});

export {
  loginSchema,
  tokenSchema,
  authorizeSchema
};