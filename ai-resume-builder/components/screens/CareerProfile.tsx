import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GuidedCareerProfileFusionStep from './career-profile/GuidedCareerProfileFusionStep';

const normalizePath = (pathname: string): string => {
  const raw = String(pathname || '').split('?')[0].split('#')[0].trim().toLowerCase();
  const stripped = raw.replace(/\/+$/, '');
  return stripped || '/';
};

const CareerProfile: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = normalizePath(location.pathname);

  React.useEffect(() => {
    if (path !== '/career-profile') return;
    navigate('/career-profile/upload', { replace: true });
  }, [navigate, path]);

  return <GuidedCareerProfileFusionStep />;
};

export default CareerProfile;
