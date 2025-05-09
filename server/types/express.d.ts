/**
 * Extended Express Request interface
 */
import { Request } from 'express';

declare global {
  namespace Express {
    export interface Request {
      /**
       * The raw query string from the URL
       * Used for Billplz signature verification
       */
      rawQuery?: string;
    }
  }
}