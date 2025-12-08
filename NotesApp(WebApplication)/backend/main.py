from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import os

# PUBLIC_INTERFACE
def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    Returns:
        FastAPI: Configured FastAPI app with health and notes endpoints.
    """
    app = FastAPI(
        title="NotesApp Backend",
        description="FastAPI backend for NotesApp providing health and notes CRUD endpoints.",
        version="0.1.0",
        openapi_tags=[
            {"name": "health", "description": "Health and readiness endpoints"},
            {"name": "notes", "description": "Notes CRUD endpoints"},
        ],
    )

    # Allow dev CORS from Vite server
    frontend_url = os.getenv("REACT_APP_FRONTEND_URL", "")
    allowed_origins = [frontend_url] if frontend_url else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # In-memory notes store for development
    class Note(BaseModel):
        id: int = Field(..., description="Unique identifier of the note")
        title: str = Field(..., description="Title of the note")
        content: str = Field("", description="Body content of the note")

    class NoteCreate(BaseModel):
        title: str = Field(..., description="Title of the note")
        content: Optional[str] = Field("", description="Body content of the note")

    NOTES: List[Note] = []
    NEXT_ID = {"value": 1}

    # PUBLIC_INTERFACE
    @app.get(
        "/healthz",
        tags=["health"],
        summary="Health check",
        description="Returns 200 OK if backend is healthy.",
        response_model=Dict[str, str],
        responses={200: {"description": "Backend healthy", "content": {"application/json": {}}}},
        operation_id="health_check",
    )
    def healthz() -> Dict[str, str]:
        """
        Health check endpoint.

        Returns:
            dict: A simple status message indicating health.
        """
        # Return minimal JSON to avoid any serialization complexity
        return {"status": "ok"}

    # Namespaced API under /api to align with proxy configuration
    # PUBLIC_INTERFACE
    @app.get("/api/notes", response_model=List[Note], tags=["notes"], summary="List notes", description="List all notes.")
    def list_notes():
        """
        List all notes.

        Returns:
            List[Note]: Array of notes.
        """
        return NOTES

    # PUBLIC_INTERFACE
    @app.post("/api/notes", response_model=Note, tags=["notes"], summary="Create note", description="Create a new note.")
    def create_note(payload: NoteCreate):
        """
        Create a new note.

        Args:
            payload (NoteCreate): Note data with title and optional content.

        Returns:
            Note: Created note.
        """
        note = Note(id=NEXT_ID["value"], title=payload.title, content=payload.content or "")
        NEXT_ID["value"] += 1
        NOTES.append(note)
        return note

    # PUBLIC_INTERFACE
    @app.get("/api/notes/{note_id}", response_model=Note, tags=["notes"], summary="Get note", description="Get a note by id.")
    def get_note(note_id: int):
        """
        Retrieve a note by its ID.

        Args:
            note_id (int): The note identifier.

        Returns:
            Note: The requested note.

        Raises:
            HTTPException: 404 if not found.
        """
        for n in NOTES:
            if n.id == note_id:
                return n
        raise HTTPException(status_code=404, detail="Note not found")

    # PUBLIC_INTERFACE
    @app.delete("/api/notes/{note_id}", tags=["notes"], summary="Delete note", description="Delete a note by id.")
    def delete_note(note_id: int):
        """
        Delete a note by its ID.

        Args:
            note_id (int): The note identifier.

        Returns:
            dict: Result status.

        Raises:
            HTTPException: 404 if not found.
        """
        idx = None
        for i, n in enumerate(NOTES):
            if n.id == note_id:
                idx = i
                break
        if idx is None:
            raise HTTPException(status_code=404, detail="Note not found")
        NOTES.pop(idx)
        return {"status": "deleted"}

    return app


app = create_app()

if __name__ == "__main__":
    # Allow overriding backend port via env, default 5179 separate from Vite's default 3000.
    backend_port = int(os.getenv("BACKEND_PORT", "5179"))
    import uvicorn
    # Use the app object directly to avoid module path confusion under reload
    uvicorn.run(app, host="0.0.0.0", port=backend_port, reload=True)
