import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Monta la biblioteca y sus lectores en el elemento raíz de la página.
createRoot(document.getElementById('root')).render(<App />)
