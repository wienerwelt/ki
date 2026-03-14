import React from 'react';
import { Alert, AlertTitle } from '@mui/material';

// Wir fügen 'name' hinzu, um das Widget zu identifizieren
type Props = { 
  children: React.ReactNode;
  name?: string; 
};

type State = { 
  hasError: boolean; 
  err?: any; 
};

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(err: any) {
    return { hasError: true, err };
  }

  componentDidCatch(err: any, info: any) {
    // Hier loggen wir den Namen des Widgets für eine bessere Suche in der Konsole
    console.error(`Widget "${this.props.name || 'Unbekannt'}" crashed:`, err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error">
          <AlertTitle>Fehler im Widget: <strong>{this.props.name || 'Unbekannt'}</strong></AlertTitle>
          Ein Widget ist abgestürzt. Details stehen in der Konsole.
        </Alert>
      );
    }

    return this.props.children;
  }
}