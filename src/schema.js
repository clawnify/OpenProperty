import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
const at = name => timestamp(name, { withTimezone:true });
const dates = () => ({createdAt:at('created_at').defaultNow().notNull(),updatedAt:at('updated_at').defaultNow().notNull()});
export const user=pgTable('user',{id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').unique().notNull(),emailVerified:boolean('email_verified').default(false).notNull(),image:text('image'),...dates()});
export const session=pgTable('session',{id:text('id').primaryKey(),token:text('token').notNull().unique(),expiresAt:at('expires_at').notNull(),userId:text('user_id').references(()=>user.id).notNull(),ipAddress:text('ip_address'),userAgent:text('user_agent'),...dates()});
export const account=pgTable('account',{id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),userId:text('user_id').references(()=>user.id).notNull(),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),accessTokenExpiresAt:at('access_token_expires_at'),refreshTokenExpiresAt:at('refresh_token_expires_at'),scope:text('scope'),password:text('password'),...dates()});
export const verification=pgTable('verification',{id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:at('expires_at').notNull(),...dates()});

