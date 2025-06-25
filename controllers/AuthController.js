// controllers/AuthController.js
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Decode Base64 credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [email, password] = credentials.split(':');

      if (!email || !password) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Hash password
      const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

      // Find user
      const db = dbClient.client.db(dbClient.database);
      const users = db.collection('users');
      const user = await users.findOne({ email, password: hashedPassword });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Generate token
      const token = uuidv4();
      const key = `auth_${token}`;
      
      // Store token in Redis for 24 hours
      await redisClient.set(key, user._id.toString(), 86400);

      res.status(200).json({ token });
    } catch (error) {
      console.error('Error connecting user:', error);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Delete token from Redis
      await redisClient.del(key);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error disconnecting user:', error);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default AuthController;
