import uvicorn
import os

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8787")),
        reload=os.environ.get("APP_ENV", "dev") == "dev",
    )
