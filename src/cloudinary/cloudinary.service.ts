import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(base64Image: string, folder: string = 'training-pro') {
    try {
      const result = await cloudinary.uploader.upload(base64Image, {
        folder,
        resource_type: 'image',
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      throw error;
    }
  }

  /**
   * Sube un archivo genérico (imagen o PDF) a Cloudinary.
   * `resource_type: 'auto'` permite tanto imágenes como PDFs.
   * Útil para justificantes de pago.
   */
  async uploadFile(
    base64File: string,
    folder: string = 'training-pro',
    resourceType: 'auto' | 'image' | 'raw' = 'auto',
  ) {
    try {
      const result = await cloudinary.uploader.upload(base64File, {
        folder,
        resource_type: resourceType,
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      console.error('Error uploading file to Cloudinary:', error);
      throw error;
    }
  }

  async deleteImage(publicId: string) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
      throw error;
    }
  }
}