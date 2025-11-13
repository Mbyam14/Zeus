from supabase import create_client, Client
from app.config import settings
from typing import Optional


class Database:
    def __init__(self):
        self.supabase: Optional[Client] = None
        
    def connect(self) -> Client:
        if not self.supabase:
            self.supabase = create_client(
                settings.supabase_url,
                settings.supabase_service_key
            )
        return self.supabase
    
    def get_client(self) -> Client:
        if not self.supabase:
            self.connect()
        return self.supabase


# Global database instance
database = Database()


def get_database() -> Client:
    return database.get_client()