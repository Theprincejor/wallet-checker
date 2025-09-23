// src/components/ClientOnlyToaster.tsx
'use client'

import { Toaster } from 'react-hot-toast'

// This component will be imported into your page
const ClientOnlyToaster = () => {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      toastOptions={{
        style: { background: '#1f2937', color: '#ffffff' },
      }}
    />
  )
}

export default ClientOnlyToaster