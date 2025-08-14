import React from 'react';
import { Alert } from '@mui/material';

type Props = { children: React.ReactNode };

export default class ErrorBoundary extends React.Component<Props, { hasError: boolean; err?: any }> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(err: any) { return { hasError: true, err }; }
  componentDidCatch(err: any, info: any) { console.error('Widget crashed:', err, info); }
  render() {
    if (this.state.hasError) {
      return <Alert severity="error">Ein Widget ist abgestürzt. Details stehen in der Konsole.</Alert>;
    }
    return this.props.children;
  }
}
