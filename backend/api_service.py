import requests
import json
from typing import Dict, Any, Optional

class APIService:
    def __init__(self, base_url: str = "http://localhost:5000"):
        self.base_url = base_url
        self.token = None
    
    def set_token(self, token: str):
        """Set authentication token"""
        self.token = token
    
    def get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication"""
        headers = {
            'Content-Type': 'application/json'
        }
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        return headers
    
    def register(self, email: str, password: str, name: str = '') -> Dict[str, Any]:
        """Register a new user"""
        response = requests.post(
            f"{self.base_url}/api/auth/register",
            json={'email': email, 'password': password, 'name': name},
            headers=self.get_headers()
        )
        return response.json()
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login user"""
        response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={'email': email, 'password': password},
            headers=self.get_headers()
        )
        data = response.json()
        if 'token' in data:
            self.set_token(data['token'])
        return data
    
    def forgot_password(self, email: str) -> Dict[str, Any]:
        """Request password reset"""
        response = requests.post(
            f"{self.base_url}/api/auth/forgot-password",
            json={'email': email},
            headers=self.get_headers()
        )
        return response.json()
    
    def get_resumes(self) -> Dict[str, Any]:
        """Get all resumes for current user"""
        response = requests.get(
            f"{self.base_url}/api/resumes",
            headers=self.get_headers()
        )
        return response.json()
    
    def create_resume(self, title: str, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new resume"""
        response = requests.post(
            f"{self.base_url}/api/resumes",
            json={'title': title, 'resumeData': resume_data},
            headers=self.get_headers()
        )
        return response.json()
    
    def get_resume(self, resume_id: str) -> Dict[str, Any]:
        """Get a specific resume"""
        response = requests.get(
            f"{self.base_url}/api/resumes/{resume_id}",
            headers=self.get_headers()
        )
        return response.json()
    
    def update_resume(self, resume_id: str, title: Optional[str] = None, 
                     resume_data: Optional[Dict[str, Any]] = None, 
                     score: Optional[int] = None) -> Dict[str, Any]:
        """Update a resume"""
        data = {}
        if title is not None:
            data['title'] = title
        if resume_data is not None:
            data['resumeData'] = resume_data
        if score is not None:
            data['score'] = score
        
        response = requests.put(
            f"{self.base_url}/api/resumes/{resume_id}",
            json=data,
            headers=self.get_headers()
        )
        return response.json()
    
    def delete_resume(self, resume_id: str) -> Dict[str, Any]:
        """Delete a resume"""
        response = requests.delete(
            f"{self.base_url}/api/resumes/{resume_id}",
            headers=self.get_headers()
        )
        return response.json()
    
    def analyze_resume(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze resume with AI"""
        response = requests.post(
            f"{self.base_url}/api/ai/analyze",
            json={'resumeData': resume_data},
            headers=self.get_headers()
        )
        return response.json()
    
    def get_profile(self) -> Dict[str, Any]:
        """Get user profile"""
        response = requests.get(
            f"{self.base_url}/api/user/profile",
            headers=self.get_headers()
        )
        return response.json()
    
    def update_profile(self, name: str) -> Dict[str, Any]:
        """Update user profile"""
        response = requests.put(
            f"{self.base_url}/api/user/profile",
            json={'name': name},
            headers=self.get_headers()
        )
        return response.json()
    
    def get_templates(self) -> Dict[str, Any]:
        """Get available templates"""
        response = requests.get(
            f"{self.base_url}/api/templates",
            headers=self.get_headers()
        )
        return response.json()
