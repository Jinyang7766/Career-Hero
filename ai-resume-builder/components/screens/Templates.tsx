import React from 'react';
import { View, ScreenProps } from '../../types';
import Editor from './Editor';

const Templates: React.FC<ScreenProps> = (props) => {
  return <Editor {...props} />;
};

export default Templates;