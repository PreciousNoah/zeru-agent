// config.js
import 'dotenv/config';

export const config = {
  baseURL: process.env.CROO_API_URL,
  wsURL: process.env.CROO_WS_URL,
  rpcURL: 'https://mainnet.base.org', // for balance checks
  logger: console,
};