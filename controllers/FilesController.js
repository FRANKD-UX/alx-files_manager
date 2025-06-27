// controllers/FilesController.js
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

const fileQueue = new Queue('file queue');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Get user from token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { name, type, parentId = 0, isPublic = false, data } = req.body;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }

      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }

      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      // Validate parentId if provided
      const db = dbClient.client.db(dbClient.database);
      const files = db.collection('files');

      if (parentId !== 0) {
        const parentFile = await files.findOne({ _id: new ObjectId(parentId) });
        
        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }

      const fileDocument = {
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? 0 : new ObjectId(parentId),
      };

      if (type === 'folder') {
        const result = await files.insertOne(fileDocument);
        
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId,
          name,
          type,
          isPublic,
          parentId,
        });
      } else {
        // Handle file/image upload
        const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
        
        // Create folder if it doesn't exist
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const fileName = uuidv4();
        const localPath = path.join(folderPath, fileName);

        // Decode and save file
        const fileContent = Buffer.from(data, 'base64');
        fs.writeFileSync(localPath, fileContent);

        fileDocument.localPath = localPath;
        
        const result = await files.insertOne(fileDocument);

        // Add job to queue for image processing
        if (type === 'image') {
          fileQueue.add({
            userId,
            fileId: result.insertedId.toString(),
          });
        }

        return res.status(201).json({
          id: result.insertedId.toString(),
          userId,
          name,
          type,
          isPublic,
          parentId,
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const { id } = req.params;
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const db = dbClient.client.db(dbClient.database);
      const files = db.collection('files');
      
      const file = await files.findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.status(200).json({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      });
    } catch (error) {
      console.error('Error getting file:', error);
      res.status(404).json({ error: 'Not found' });
    }
  }

  static async getIndex(req, res) {
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

      const { parentId = 0, page = 0 } = req.query;
      const pageSize = 20;
      const skip = parseInt(page) * pageSize;

      const db = dbClient.client.db(dbClient.database);
      const files = db.collection('files');

      const query = {
        userId: new ObjectId(userId),
        parentId: parentId === '0' ? 0 : new ObjectId(parentId),
      };

      const filesList = await files
        .find(query)
        .skip(skip)
        .limit(pageSize)
        .toArray();

      const formattedFiles = filesList.map(file => ({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      }));

      res.status(200).json(formattedFiles);
    } catch (error) {
      console.error('Error getting files:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putPublish(req, res) {
    return FilesController.updatePublishStatus(req, res, true);
  }

  static async putUnpublish(req, res) {
    return FilesController.updatePublishStatus(req, res, false);
  }

  static async updatePublishStatus(req, res, isPublic) {
    const token = req.headers['x-token'];
    const { id } = req.params;
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const db = dbClient.client.db(dbClient.database);
      const files = db.collection('files');
      
      const file = await files.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          userId: new ObjectId(userId),
        },
        { $set: { isPublic } },
        { returnDocument: 'after' }
      );

      if (!file.value) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.status(200).json({
        id: file.value._id.toString(),
        userId: file.value.userId.toString(),
        name: file.value.name,
        type: file.value.type,
        isPublic: file.value.isPublic,
        parentId: file.value.parentId === 0 ? 0 : file.value.parentId.toString(),
      });
    } catch (error) {
      console.error('Error updating file:', error);
      res.status(404).json({ error: 'Not found' });
    }
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    const token = req.headers['x-token'];

    try {
      const db = dbClient.client.db(dbClient.database);
      const files = db.collection('files');
      
      const file = await files.findOne({ _id: new ObjectId(id) });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check if file is public or user is authenticated and owns the file
      let isAuthorized = file.isPublic;
      
      if (!isAuthorized && token) {
        const key = `auth_${token}`;
        const userId = await redisClient.get(key);
        
        if (userId && userId === file.userId.toString()) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      let filePath = file.localPath;
      
      // Handle thumbnail sizes for images
      if (size && ['100', '250', '500'].includes(size)) {
        filePath = `${file.localPath}_${size}`;
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Get MIME type
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      
      res.setHeader('Content-Type', mimeType);
      
      const fileContent = fs.readFileSync(filePath);
      res.send(fileContent);
    } catch (error) {
      console.error('Error getting file data:', error);
      res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
