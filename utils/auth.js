// utils/auth.js
import { ObjectId } from 'mongodb';
import redisClient from './redis.js';
import dbClient from './db.js';

class AuthUtils {
  static async getUserFromToken(token) {
    if (!token) {
      return null;
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return null;
      }

      const db = dbClient.client.db(dbClient.database);
      const users = db.collection('users');
      const user = await users.findOne({ _id: new ObjectId(userId) });

      return user;
    } catch (error) {
      console.error('Error getting user from token:', error);
      return null;
    }
  }

  static async getUserIdFromToken(token) {
    if (!token) {
      return null;
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      return userId;
    } catch (error) {
      console.error('Error getting user ID from token:', error);
      return null;
    }
  }
}

export default AuthUtils;
