# Zeus Backend API

Social meal planning application backend built with FastAPI, Supabase, and AWS.

## Features

- 🔐 JWT Authentication with Supabase
- 🍳 Recipe CRUD with AI generation (Claude API)
- 📅 Weekly meal planning
- 🥘 Pantry inventory management
- 👥 Social features (friends, likes, trending)
- 📱 Mobile-first API design
- ☁️ AWS S3 image storage

## Tech Stack

- **Backend**: Python 3.11+ with FastAPI
- **Database & Auth**: Supabase (PostgreSQL + JWT Auth)
- **Storage**: AWS S3 + CloudFront
- **AI**: Anthropic Claude API
- **Deployment**: AWS Elastic Beanstalk

## Project Structure

```
zeus-backend/
├── app/
│   ├── main.py                 # FastAPI app
│   ├── config.py               # Settings
│   ├── database.py             # DB connection
│   ├── api/                    # Route handlers
│   │   ├── auth.py
│   │   ├── recipes.py
│   │   ├── meal_plans.py
│   │   ├── pantry.py
│   │   ├── social.py
│   │   └── ai.py
│   ├── models/                 # SQLAlchemy models
│   │   ├── user.py
│   │   ├── recipe.py
│   │   ├── meal_plan.py
│   │   └── pantry.py
│   ├── schemas/                # Pydantic schemas
│   │   ├── user.py
│   │   ├── recipe.py
│   │   └── meal_plan.py
│   ├── services/               # Business logic
│   │   ├── auth_service.py
│   │   ├── recipe_service.py
│   │   ├── ai_service.py
│   │   └── s3_service.py
│   └── utils/
│       ├── dependencies.py     # Auth middleware
│       └── security.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.11+
- Supabase account
- AWS account (S3 bucket)
- Anthropic API key

### 1. Clone and Install

```bash
git clone <repository-url>
cd zeus-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

Required environment variables:

```env
APP_NAME=Zeus
ENVIRONMENT=development
DEBUG=True
SECRET_KEY=your-secret-key-here

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# AWS
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=zeus-recipe-images

# AI
ANTHROPIC_API_KEY=sk-ant-your-key

# CORS
ALLOWED_ORIGINS=http://localhost:19006
```

### 3. Supabase Setup

Create the following tables in your Supabase database:

```sql
-- Users table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    username VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    profile_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipes table
CREATE TABLE recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    description TEXT,
    image_url VARCHAR,
    ingredients JSONB NOT NULL,
    instructions JSONB NOT NULL,
    servings INTEGER DEFAULT 4,
    prep_time INTEGER, -- minutes
    cook_time INTEGER, -- minutes
    cuisine_type VARCHAR,
    difficulty VARCHAR CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    meal_type VARCHAR[] DEFAULT '{}',
    dietary_tags VARCHAR[] DEFAULT '{}',
    is_ai_generated BOOLEAN DEFAULT FALSE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meal plans table
CREATE TABLE meal_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR NOT NULL,
    week_start_date DATE NOT NULL,
    meals JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pantry items table
CREATE TABLE pantry_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_name VARCHAR NOT NULL,
    quantity DECIMAL,
    unit VARCHAR,
    category VARCHAR,
    expires_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Friendships table
CREATE TABLE friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Recipe likes table
CREATE TABLE recipe_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

-- Recipe saves table
CREATE TABLE recipe_saves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);
```

### 4. AWS S3 Setup

1. Create an S3 bucket for recipe images
2. Configure bucket permissions for public read access (for images)
3. Optional: Set up CloudFront distribution

### 5. Run the Application

```bash
# Development server with auto-reload
python app/main.py

# Or using uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### 6. API Documentation

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Recipes
- `GET /api/recipes/feed` - Get recipe feed
- `GET /api/recipes/{id}` - Get recipe details
- `POST /api/recipes` - Create recipe
- `PUT /api/recipes/{id}` - Update recipe
- `DELETE /api/recipes/{id}` - Delete recipe
- `POST /api/recipes/{id}/like` - Like recipe
- `POST /api/recipes/{id}/save` - Save recipe

### AI
- `POST /api/ai/generate-recipe` - Generate AI recipe
- `POST /api/ai/generate-meal-plan` - Generate AI meal plan

### Meal Plans
- `GET /api/meal-plans` - Get user meal plans
- `POST /api/meal-plans` - Create meal plan
- `PUT /api/meal-plans/{id}` - Update meal plan
- `DELETE /api/meal-plans/{id}` - Delete meal plan
- `GET /api/meal-plans/{id}/grocery-list` - Get grocery list

### Pantry
- `GET /api/pantry` - Get pantry items
- `POST /api/pantry/items` - Add pantry item
- `PUT /api/pantry/items/{id}` - Update item
- `DELETE /api/pantry/items/{id}` - Delete item

### Social
- `POST /api/social/friends` - Send friend request
- `GET /api/social/friends` - Get friends list
- `GET /api/social/trending` - Get trending recipes
- `GET /api/social/popular` - Get popular recipes

## Development

### Code Style
- Use `black` for code formatting: `black .`
- Follow async/await patterns for all I/O operations
- Include type hints on all functions
- Use Pydantic models for validation

### Testing
```bash
pytest
```

### Deployment

The application is configured for AWS Elastic Beanstalk deployment. Create an `application.py` file for EB:

```python
from app.main import app
application = app
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper tests
4. Submit a pull request

## License

[Add your license here]