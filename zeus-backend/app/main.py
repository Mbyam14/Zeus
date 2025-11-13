from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import auth, recipes, ai


app = FastAPI(
    title=settings.app_name,
    description="Zeus - Social Meal Planning Application Backend",
    version="1.0.0",
    debug=settings.debug
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(recipes.router)
app.include_router(ai.router)


@app.get("/")
async def root():
    return {"message": "Welcome to Zeus API", "status": "healthy"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "version": "1.0.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )