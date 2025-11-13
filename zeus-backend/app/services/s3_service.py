import boto3
import uuid
from typing import Optional
from fastapi import HTTPException, status, UploadFile
from botocore.exceptions import ClientError, NoCredentialsError
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class S3Service:
    def __init__(self):
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region_name=settings.aws_region
            )
            self.bucket_name = settings.s3_bucket_name
        except NoCredentialsError:
            logger.warning("AWS credentials not configured. S3 functionality will be disabled.")
            self.s3_client = None
            self.bucket_name = None
    
    async def upload_recipe_image(self, file: UploadFile, user_id: str) -> str:
        """Upload a recipe image to S3 and return the public URL"""
        if not self.s3_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Image upload service not configured"
            )
        
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Validate file size (max 10MB)
        file_content = await file.read()
        if len(file_content) > 10 * 1024 * 1024:  # 10MB
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size must be less than 10MB"
            )
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"recipes/{user_id}/{uuid.uuid4()}.{file_extension}"
        
        try:
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Body=file_content,
                ContentType=file.content_type,
                ACL='public-read'  # Make image publicly accessible
            )
            
            # Return public URL
            public_url = f"https://{self.bucket_name}.s3.{settings.aws_region}.amazonaws.com/{unique_filename}"
            return public_url
            
        except ClientError as e:
            logger.error(f"Failed to upload image to S3: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload image"
            )
    
    async def delete_recipe_image(self, image_url: str) -> bool:
        """Delete a recipe image from S3"""
        if not self.s3_client or not image_url:
            return False
        
        try:
            # Extract key from URL
            if self.bucket_name in image_url:
                key = image_url.split(f"{self.bucket_name}.s3.{settings.aws_region}.amazonaws.com/")[1]
                
                self.s3_client.delete_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
                return True
        except ClientError as e:
            logger.error(f"Failed to delete image from S3: {e}")
            return False
        
        return False
    
    async def upload_profile_image(self, file: UploadFile, user_id: str) -> str:
        """Upload a profile image to S3 and return the public URL"""
        if not self.s3_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Image upload service not configured"
            )
        
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Validate file size (max 5MB for profile images)
        file_content = await file.read()
        if len(file_content) > 5 * 1024 * 1024:  # 5MB
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Profile image must be less than 5MB"
            )
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"profiles/{user_id}/avatar.{file_extension}"
        
        try:
            # Upload to S3 (overwrite existing profile image)
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Body=file_content,
                ContentType=file.content_type,
                ACL='public-read'
            )
            
            # Return public URL
            public_url = f"https://{self.bucket_name}.s3.{settings.aws_region}.amazonaws.com/{unique_filename}"
            return public_url
            
        except ClientError as e:
            logger.error(f"Failed to upload profile image to S3: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload profile image"
            )
    
    def get_presigned_upload_url(self, user_id: str, file_type: str = "recipe") -> dict:
        """Generate a presigned URL for direct client uploads"""
        if not self.s3_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Image upload service not configured"
            )
        
        # Generate unique filename
        unique_filename = f"{file_type}s/{user_id}/{uuid.uuid4()}"
        
        try:
            presigned_post = self.s3_client.generate_presigned_post(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Fields={"acl": "public-read"},
                Conditions=[
                    {"acl": "public-read"},
                    ["content-length-range", 1, 10 * 1024 * 1024],  # 1 byte to 10MB
                    ["starts-with", "$Content-Type", "image/"]
                ],
                ExpiresIn=3600  # URL expires in 1 hour
            )
            
            # Add the final URL that will be accessible after upload
            presigned_post['file_url'] = f"https://{self.bucket_name}.s3.{settings.aws_region}.amazonaws.com/{unique_filename}"
            
            return presigned_post
            
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate upload URL"
            )


# Global S3 service instance
s3_service = S3Service()