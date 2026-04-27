import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Droplets,
  HelpCircle,
  LoaderCircle,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Stethoscope,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import {
  apiFetch,
  clearStoredSessionToken,
  detectApiBaseUrl,
  getApiBaseUrl,
  getStoredSessionToken,
  setStoredSessionToken,
} from './api';

type Urgency = 'low' | 'medium' | 'high';
type FieldOccurrenceType = 'COCHO' | 'AGUA' | 'DOENTE' | 'AVARIA' | 'NASCEU' | 'MORREU';

interface ActionConfig {
  id: FieldOccurrenceType;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  urgency: Urgency;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  fieldProfile?: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
  allowedFarmIds?: string[];
  defaultFarmId?: string | null;
  appContext?: {
    profile?: string;
    mode?: string;
  };
}

interface Farm {
  id: string;
  name: string;
}

interface Paddock {
  id: string;
  name: string;
}

interface Animal {
  id: string;
  brinco?: string | null;
  identificacao?: string | null;
  name?: string | null;
}

interface PendingPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

interface PendingReport {
  localId: string;
  farmId: string;
  type: FieldOccurrenceType;
  description: string;
  animalId: string | null;
  paddockId: string | null;
  occurredAt: string;
  offlineCreatedAt: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  photos: PendingPhoto[];
  remoteOccurrenceId: string | null;
  uploadedPhotoIds: string[];
  syncError: string | null;
}

const PENDING_REPORTS_KEY = 'eixo_app_manejo_pending_reports';
const DEVICE_ID_KEY = 'eixo_app_manejo_device_id';

const ACTIONS: ActionConfig[] = [
  {
    id: 'COCHO',
    icon: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* telhado */}
        <polygon points="22,3 2,17 42,17" fill="#a8442a"/>
        <polygon points="22,3 2,17 42,17" fill="none" stroke="#78350f" strokeWidth="1"/>
        {/* linhas do telhado */}
        <line x1="12" y1="10" x2="22" y2="3" stroke="#78350f" strokeWidth="0.8" opacity="0.6"/>
        <line x1="22" y1="10" x2="22" y2="3" stroke="#78350f" strokeWidth="0.8" opacity="0.6"/>
        <line x1="32" y1="10" x2="22" y2="3" stroke="#78350f" strokeWidth="0.8" opacity="0.6"/>
        <line x1="2" y1="17" x2="42" y2="17" stroke="#78350f" strokeWidth="0.8" opacity="0.6"/>
        {/* pilar esquerdo */}
        <rect x="8" y="17" width="3.5" height="19" rx="1" fill="#78350f"/>
        {/* pilar direito */}
        <rect x="32.5" y="17" width="3.5" height="19" rx="1" fill="#78350f"/>
        {/* calha — perfil em U */}
        <path d="M6 30 Q6 38 10 38 L34 38 Q38 38 38 30 Z" fill="#92400e" stroke="#78350f" strokeWidth="1"/>
        {/* ração */}
        <ellipse cx="22" cy="31" rx="11" ry="3" fill="#d97706" opacity="0.8"/>
      </svg>
    ),
    label: 'COCHO',
    subtitle: 'Ração e sal',
    urgency: 'low',
  },
  {
    id: 'AGUA',
    icon: <Droplets className="w-10 h-10 text-blue-500" />,
    label: 'ÁGUA',
    subtitle: 'Bebedouros',
    urgency: 'medium',
  },
  {
    id: 'NASCEU',
    icon: (
      <div className="relative flex items-center justify-center w-14 h-14">
        <div className="absolute inset-0 rounded-2xl bg-[#faeee8]" />
        <div className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#f6c453] shadow-sm">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5.5 1.2V9.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M1.2 5.5H9.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M2.3 2.3L8.7 8.7" stroke="white" strokeWidth="1" strokeLinecap="round" />
            <path d="M8.7 2.3L2.3 8.7" stroke="white" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </div>
        <svg
          className="relative"
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <symbol id="nasceuCowBody" viewBox="0 0 512 512">
              <path
                d="M512,237.3c-0.008-14.331-1.105-28.117-4.601-40.405c-1.748-6.136-4.102-11.914-7.285-17.14c-3.166-5.226-7.17-9.899-12.101-13.733l-0.054-0.036l0,0c-9.399-7.161-18.112-11.896-27.287-14.732c-9.176-2.836-18.647-3.754-29.544-3.754c-12.324,0-26.583,1.15-45.006,2.229c-16.454,0.973-38.747,1.142-59.132,1.142c-10.853,0-21.171-0.045-29.829-0.045c-11.931,0.009-31.631-1.748-51.704-4.548c-20.065-2.782-40.664-6.635-54.504-10.647c-12.823-3.71-24.21-8.48-34.047-12.423c-4.922-1.97-9.47-3.736-13.698-5.056c-1.56-0.472-3.058-0.874-4.547-1.222c2.051-4.86,2.809-9.675,2.809-13.742c0-2.291-0.223-4.351-0.668-6.206c-0.224-0.928-0.5-1.802-0.892-2.685c-0.401-0.883-0.874-1.783-1.854-2.792v0.009c-1.454-1.426-3.05-2.22-4.771-2.79c-1.73-0.554-3.612-0.838-5.636-0.838c-3.825,0-8.204,1.07-12.68,3.486c-0.838-5.155-2.72-10.05-4.958-14.313c-1.534-2.889-3.246-5.475-5.056-7.669c-1.837-2.185-3.674-3.995-6.028-5.324c-2.818-1.56-5.716-2.426-8.632-2.434c-2.479,0-5.082,0.651-7.268,2.434c-1.07,0.882-1.997,2.051-2.604,3.38c-0.606,1.32-0.891,2.764-0.882,4.164c0,1.695,0.384,3.318,1.016,4.842c0.9,2.167,1.774,4.869,2.39,7.589c0.624,2.72,0.99,5.484,0.99,7.687c0,1.417-0.152,2.594-0.365,3.326c-0.089,0.303-0.179,0.508-0.241,0.651c-1.828,1.115-6.43,3.942-11.414,7.026c-3.211,1.98-6.563,4.058-9.408,5.832c-2.844,1.784-5.145,3.237-6.411,4.076c-0.803,0.544-1.293,1.016-1.89,1.57c-1.079,1.026-2.283,2.318-3.71,3.906c-4.931,5.511-12.315,14.482-19.04,22.419c-3.352,3.96-6.536,7.651-9.078,10.434c-1.266,1.382-2.38,2.551-3.228,3.371c-0.419,0.402-0.767,0.722-0.999,0.918l-0.232,0.178c-2.577,1.472-6.394,3.576-9.774,5.814c-1.712,1.15-3.318,2.319-4.753,3.692c-0.722,0.705-1.409,1.454-2.06,2.462c-0.32,0.508-0.633,1.088-0.883,1.792C0.187,169.91,0,170.765,0,171.747c0.018,1.07,0.161,1.614,0.303,2.211c0.277,1.062,0.633,2.078,1.106,3.265c1.641,4.066,4.566,9.871,7.928,15.062c1.694,2.586,3.46,4.994,5.431,7.009c0.999,1.007,2.051,1.935,3.335,2.728c1.276,0.775,2.881,1.516,5.048,1.542c0.356-0.008,1.748,0.071,3.593,0.223c6.572,0.544,19.788,1.972,34.502,3.496c13.635,1.417,28.554,2.925,40.985,3.932c1.998,3.353,5.761,9.845,10.015,17.924c5.565,10.559,11.95,23.837,16.203,36.081c1.177,3.389,2.453,7.964,3.763,13.046c1.989,7.633,4.076,16.426,6.341,24.541c1.132,4.066,2.31,7.964,3.558,11.504c1.248,3.548,2.56,6.733,4.084,9.47c7.232,12.939,14.508,24.817,19.859,34.93c2.666,5.047,4.86,9.658,6.323,13.644c1.48,3.968,2.193,7.303,2.175,9.64c0,12.225,0,37.935,0,42.876l-5.234,17.745l3.746,2.337c0.678,0.437,7.794,4.664,20.421,4.664c3.531,0,6.662-0.66,9.3-1.935c1.972-0.954,3.639-2.247,4.932-3.683c1.935-2.167,3.022-4.566,3.629-6.706c0.606-2.149,0.767-4.057,0.767-5.556c0-1.881,0-16.016,0-29.669c0-6.83,0-13.546,0-18.557c0-5.003,0-8.284,0-8.302v-0.597l-0.133-0.598l-0.028-0.142c-0.152-0.74-0.874-4.343-1.56-8.739c-0.686-4.379-1.301-9.622-1.293-13.287c-0.008-0.526,0.134-2.158,0.456-4.2c1.061-7.099,3.825-19.806,6.447-31.551c4.244,1.213,10.104,2.854,16.56,4.557c6.411,1.686,13.394,3.434,19.966,4.887c6.59,1.453,12.698,2.612,17.63,3.103c24.576,2.461,43.437,4.94,73.801,4.94c6.688,0,13.938-0.125,21.928-0.384c23.622-0.784,41.11-6.269,52.738-11.655c4.94-2.292,8.756-4.53,11.619-6.412c4.556,11.852,10.87,21.09,16.837,27.894c4.53,5.181,8.864,9.034,11.985,11.682c1.106,0.928,2.051,1.712,2.773,2.319c-0.045,0.633-0.099,1.328-0.152,2.158c-0.562,7.883-1.819,24.229-2.934,38.596c-0.554,7.178-1.07,13.866-1.454,18.762c-0.249,3.246-0.446,5.672-0.544,6.956l-8.846,19.342l4.04,2.773c0.749,0.526,7.446,4.762,20.064,4.753c3.398,0,6.492-0.509,9.248-1.596c2.069-0.812,3.924-1.953,5.484-3.362c2.336-2.122,3.924-4.78,4.86-7.517c0.946-2.747,1.293-5.591,1.293-8.409c-0.008-0.054,0.036-0.66,0.134-1.463c0.384-3.139,1.57-9.515,3.121-17.148c2.31-11.486,5.44-26.021,7.99-38.453c1.274-6.215,2.408-11.905,3.228-16.479c0.41-2.283,0.749-4.29,0.99-5.975c0.232-1.712,0.393-2.997,0.402-4.334c0-0.446-0.009-0.892-0.125-1.579c-0.999-5.645-1.427-12.315-1.418-19.681c-0.009-12.422,1.168-26.779,2.372-41.708C510.787,267.726,512,252.21,512,237.3z M493.88,364.5c-2.318,11.538-5.44,26.074-7.99,38.461c-1.276,6.198-2.408,11.851-3.228,16.372c-0.411,2.266-0.75,4.245-0.99,5.894c-0.232,1.686-0.393,2.926-0.402,4.254c0,1.632-0.196,3.067-0.535,4.209c-0.535,1.73-1.222,2.72-2.336,3.522c-1.115,0.776-2.997,1.517-6.386,1.525c-3.825-0.008-6.786-0.481-8.962-1.043l5.136-11.227l0.08-1.035c0,0,1.328-16.961,2.666-34.217c0.659-8.623,1.328-17.326,1.828-24.014c0.24-3.345,0.455-6.18,0.597-8.267c0.08-1.044,0.133-1.9,0.178-2.541c0.018-0.331,0.028-0.598,0.045-0.83c0.009-0.24,0.018-0.383,0.026-0.704c-0.008-0.874-0.187-1.543-0.356-2.051c-0.366-0.99-0.741-1.471-1.035-1.873c-0.58-0.749-1.008-1.142-1.48-1.587c-0.874-0.794-1.864-1.596-3.067-2.604c-4.165-3.486-10.844-9.238-17.095-18.022c-6.233-8.784-12.004-20.484-14.224-35.974l-11.513,1.641c0.454,3.184,1.07,6.19,1.775,9.114c-5.868,4.369-25.523,16.871-61.112,18.067c-7.874,0.258-14.99,0.374-21.545,0.374c-29.704,0-47.816-2.39-72.642-4.878c-4.084-0.401-9.942-1.48-16.274-2.88c-9.524-2.105-20.189-4.914-28.438-7.196c-3.086-0.856-5.831-1.632-8.061-2.265c0.49-2.185,0.954-4.272,1.356-6.144c0.508-2.328,0.936-4.37,1.275-6.055c0.339-1.712,0.571-2.979,0.696-4.102l-11.557-1.284c-0.045,0.428-0.303,1.917-0.687,3.816c-1.373,6.787-4.388,19.788-7.054,32.033c-1.338,6.134-2.595,12.092-3.522,17.077c-0.464,2.497-0.848,4.753-1.124,6.697c-0.277,1.962-0.455,3.558-0.464,5.083c0.009,5.136,0.812,11.12,1.588,15.998c0.597,3.728,1.177,6.724,1.426,7.954c0,1.159,0,3.95,0,7.714c0,15.017,0,45.399,0,48.226c0,0.562-0.062,1.347-0.241,2.105c-0.142,0.562-0.339,1.096-0.588,1.56c-0.402,0.687-0.829,1.186-1.632,1.65c-0.812,0.455-2.14,0.927-4.53,0.927c-4.486,0-7.874-0.668-10.264-1.364l2.96-10.068v-0.838c0,0,0-30.15,0-43.714c-0.009-4.45-1.15-8.927-2.889-13.671c-2.631-7.098-6.706-14.82-11.459-23.239c-4.744-8.4-10.166-17.461-15.48-26.976c-1.364-2.417-2.917-6.368-4.388-10.996c-2.238-6.974-4.388-15.525-6.447-23.73c-2.069-8.23-4.032-16.06-6.082-21.982c-4.886-14.036-12.056-28.634-18.031-39.816c-5.966-11.182-10.737-18.914-10.781-18.985l-1.552-2.515l-2.951-0.232c-14.571-1.115-33.673-3.095-49.867-4.78c-8.098-0.856-15.472-1.632-21.232-2.202c-2.872-0.276-5.342-0.508-7.322-0.678c-1.552-0.125-2.729-0.214-3.728-0.241c-0.214-0.16-0.509-0.401-0.91-0.82c-1.07-1.07-2.479-2.898-3.844-4.994c-2.069-3.148-4.111-6.92-5.574-10.006c-0.633-1.328-1.132-2.487-1.498-3.415c0.276-0.232,0.58-0.473,0.927-0.722c1.392-1.035,3.291-2.229,5.209-3.362c1.916-1.132,3.87-2.22,5.492-3.148c0.919-0.535,1.516-1.035,2.185-1.614c1.213-1.062,2.506-2.382,4.012-3.987c5.19-5.564,12.654-14.553,19.342-22.526c3.335-3.968,6.474-7.669,8.954-10.487c1.239-1.4,2.318-2.586,3.129-3.424c0.411-0.419,0.75-0.758,0.982-0.963l0.24-0.214l0,0c1.034-0.686,3.3-2.122,6.046-3.843c4.227-2.64,9.623-5.975,13.965-8.641c4.343-2.676,7.606-4.682,7.616-4.682l0.526-0.32l0.455-0.428c1.882-1.811,2.926-4.004,3.532-6.135c0.597-2.14,0.802-4.298,0.802-6.492c0-3.407-0.509-6.894-1.276-10.273c-0.642-2.782-1.48-5.413-2.408-7.848c0.428,0.142,0.883,0.33,1.401,0.624c0.32,0.152,1.516,1.098,2.71,2.578c1.846,2.22,3.898,5.573,5.387,9.203c1.507,3.638,2.443,7.562,2.434,10.879c0,1.935-0.295,3.647-0.866,5.101l5.404,2.131l4.37,3.844c6.091-6.893,11.7-8.436,14.928-8.445c0.812-0.009,1.427,0.107,1.854,0.223c0.036,0.169,0.08,0.357,0.116,0.562c0.134,0.758,0.224,1.757,0.224,2.88c0.008,3.336-0.812,7.741-3.085,11.665c-2.301,3.95-5.877,7.562-12.217,10.005l4.128,10.87c5.288-1.989,9.533-4.86,12.832-8.151c1.98,0.054,4.807,0.607,8.248,1.686c5.503,1.703,12.449,4.61,20.51,7.83c8.062,3.22,17.256,6.76,27.466,9.711c14.803,4.281,35.671,8.142,56.136,10.995c20.466,2.845,40.352,4.656,53.3,4.656c8.615,0,18.941,0.053,29.829,0.053c20.466,0,42.866-0.169,59.81-1.168c18.549-1.088,32.737-2.221,44.329-2.212c10.282,0,18.433,0.865,26.102,3.237c7.661,2.382,15.009,6.287,23.649,12.85c3.727,2.898,6.769,6.421,9.301,10.576c3.79,6.234,6.376,13.921,7.972,22.677c1.605,8.757,2.221,18.54,2.221,28.831c0,14.276-1.186,29.517-2.372,44.427c-1.194,14.919-2.407,29.508-2.416,42.644c0.009,7.651,0.419,14.812,1.552,21.34c-0.009,0.179-0.045,0.731-0.133,1.472C496.609,350.391,495.423,356.83,493.88,364.5z"
                fill="#a8442a"
              />
            </symbol>
            <symbol id="nasceuCowHalo" viewBox="0 0 512 512">
              <path
                d="M512,237.3c-0.008-14.331-1.105-28.117-4.601-40.405c-1.748-6.136-4.102-11.914-7.285-17.14c-3.166-5.226-7.17-9.899-12.101-13.733l-0.054-0.036l0,0c-9.399-7.161-18.112-11.896-27.287-14.732c-9.176-2.836-18.647-3.754-29.544-3.754c-12.324,0-26.583,1.15-45.006,2.229c-16.454,0.973-38.747,1.142-59.132,1.142c-10.853,0-21.171-0.045-29.829-0.045c-11.931,0.009-31.631-1.748-51.704-4.548c-20.065-2.782-40.664-6.635-54.504-10.647c-12.823-3.71-24.21-8.48-34.047-12.423c-4.922-1.97-9.47-3.736-13.698-5.056c-1.56-0.472-3.058-0.874-4.547-1.222c2.051-4.86,2.809-9.675,2.809-13.742c0-2.291-0.223-4.351-0.668-6.206c-0.224-0.928-0.5-1.802-0.892-2.685c-0.401-0.883-0.874-1.783-1.854-2.792v0.009c-1.454-1.426-3.05-2.22-4.771-2.79c-1.73-0.554-3.612-0.838-5.636-0.838c-3.825,0-8.204,1.07-12.68,3.486c-0.838-5.155-2.72-10.05-4.958-14.313c-1.534-2.889-3.246-5.475-5.056-7.669c-1.837-2.185-3.674-3.995-6.028-5.324c-2.818-1.56-5.716-2.426-8.632-2.434c-2.479,0-5.082,0.651-7.268,2.434c-1.07,0.882-1.997,2.051-2.604,3.38c-0.606,1.32-0.891,2.764-0.882,4.164c0,1.695,0.384,3.318,1.016,4.842c0.9,2.167,1.774,4.869,2.39,7.589c0.624,2.72,0.99,5.484,0.99,7.687c0,1.417-0.152,2.594-0.365,3.326c-0.089,0.303-0.179,0.508-0.241,0.651c-1.828,1.115-6.43,3.942-11.414,7.026c-3.211,1.98-6.563,4.058-9.408,5.832c-2.844,1.784-5.145,3.237-6.411,4.076c-0.803,0.544-1.293,1.016-1.89,1.57c-1.079,1.026-2.283,2.318-3.71,3.906c-4.931,5.511-12.315,14.482-19.04,22.419c-3.352,3.96-6.536,7.651-9.078,10.434c-1.266,1.382-2.38,2.551-3.228,3.371c-0.419,0.402-0.767,0.722-0.999,0.918l-0.232,0.178c-2.577,1.472-6.394,3.576-9.774,5.814c-1.712,1.15-3.318,2.319-4.753,3.692c-0.722,0.705-1.409,1.454-2.06,2.462c-0.32,0.508-0.633,1.088-0.883,1.792C0.187,169.91,0,170.765,0,171.747c0.018,1.07,0.161,1.614,0.303,2.211c0.277,1.062,0.633,2.078,1.106,3.265c1.641,4.066,4.566,9.871,7.928,15.062c1.694,2.586,3.46,4.994,5.431,7.009c0.999,1.007,2.051,1.935,3.335,2.728c1.276,0.775,2.881,1.516,5.048,1.542c0.356-0.008,1.748,0.071,3.593,0.223c6.572,0.544,19.788,1.972,34.502,3.496c13.635,1.417,28.554,2.925,40.985,3.932c1.998,3.353,5.761,9.845,10.015,17.924c5.565,10.559,11.95,23.837,16.203,36.081c1.177,3.389,2.453,7.964,3.763,13.046c1.989,7.633,4.076,16.426,6.341,24.541c1.132,4.066,2.31,7.964,3.558,11.504c1.248,3.548,2.56,6.733,4.084,9.47c7.232,12.939,14.508,24.817,19.859,34.93c2.666,5.047,4.86,9.658,6.323,13.644c1.48,3.968,2.193,7.303,2.175,9.64c0,12.225,0,37.935,0,42.876l-5.234,17.745l3.746,2.337c0.678,0.437,7.794,4.664,20.421,4.664c3.531,0,6.662-0.66,9.3-1.935c1.972-0.954,3.639-2.247,4.932-3.683c1.935-2.167,3.022-4.566,3.629-6.706c0.606-2.149,0.767-4.057,0.767-5.556c0-1.881,0-16.016,0-29.669c0-6.83,0-13.546,0-18.557c0-5.003,0-8.284,0-8.302v-0.597l-0.133-0.598l-0.028-0.142c-0.152-0.74-0.874-4.343-1.56-8.739c-0.686-4.379-1.301-9.622-1.293-13.287c-0.008-0.526,0.134-2.158,0.456-4.2c1.061-7.099,3.825-19.806,6.447-31.551c4.244,1.213,10.104,2.854,16.56,4.557c6.411,1.686,13.394,3.434,19.966,4.887c6.59,1.453,12.698,2.612,17.63,3.103c24.576,2.461,43.437,4.94,73.801,4.94c6.688,0,13.938-0.125,21.928-0.384c23.622-0.784,41.11-6.269,52.738-11.655c4.94-2.292,8.756-4.53,11.619-6.412c4.556,11.852,10.87,21.09,16.837,27.894c4.53,5.181,8.864,9.034,11.985,11.682c1.106,0.928,2.051,1.712,2.773,2.319c-0.045,0.633-0.099,1.328-0.152,2.158c-0.562,7.883-1.819,24.229-2.934,38.596c-0.554,7.178-1.07,13.866-1.454,18.762c-0.249,3.246-0.446,5.672-0.544,6.956l-8.846,19.342l4.04,2.773c0.749,0.526,7.446,4.762,20.064,4.753c3.398,0,6.492-0.509,9.248-1.596c2.069-0.812,3.924-1.953,5.484-3.362c2.336-2.122,3.924-4.78,4.86-7.517c0.946-2.747,1.293-5.591,1.293-8.409c-0.008-0.054,0.036-0.66,0.134-1.463c0.384-3.139,1.57-9.515,3.121-17.148c2.31-11.486,5.44-26.021,7.99-38.453c1.274-6.215,2.408-11.905,3.228-16.479c0.41-2.283,0.749-4.29,0.99-5.975c0.232-1.712,0.393-2.997,0.402-4.334c0-0.446-0.009-0.892-0.125-1.579c-0.999-5.645-1.427-12.315-1.418-19.681c-0.009-12.422,1.168-26.779,2.372-41.708C510.787,267.726,512,252.21,512,237.3z M493.88,364.5c-2.318,11.538-5.44,26.074-7.99,38.461c-1.276,6.198-2.408,11.851-3.228,16.372c-0.411,2.266-0.75,4.245-0.99,5.894c-0.232,1.686-0.393,2.926-0.402,4.254c0,1.632-0.196,3.067-0.535,4.209c-0.535,1.73-1.222,2.72-2.336,3.522c-1.115,0.776-2.997,1.517-6.386,1.525c-3.825-0.008-6.786-0.481-8.962-1.043l5.136-11.227l0.08-1.035c0,0,1.328-16.961,2.666-34.217c0.659-8.623,1.328-17.326,1.828-24.014c0.24-3.345,0.455-6.18,0.597-8.267c0.08-1.044,0.133-1.9,0.178-2.541c0.018-0.331,0.028-0.598,0.045-0.83c0.009-0.24,0.018-0.383,0.026-0.704c-0.008-0.874-0.187-1.543-0.356-2.051c-0.366-0.99-0.741-1.471-1.035-1.873c-0.58-0.749-1.008-1.142-1.48-1.587c-0.874-0.794-1.864-1.596-3.067-2.604c-4.165-3.486-10.844-9.238-17.095-18.022c-6.233-8.784-12.004-20.484-14.224-35.974l-11.513,1.641c0.454,3.184,1.07,6.19,1.775,9.114c-5.868,4.369-25.523,16.871-61.112,18.067c-7.874,0.258-14.99,0.374-21.545,0.374c-29.704,0-47.816-2.39-72.642-4.878c-4.084-0.401-9.942-1.48-16.274-2.88c-9.524-2.105-20.189-4.914-28.438-7.196c-3.086-0.856-5.831-1.632-8.061-2.265c0.49-2.185,0.954-4.272,1.356-6.144c0.508-2.328,0.936-4.37,1.275-6.055c0.339-1.712,0.571-2.979,0.696-4.102l-11.557-1.284c-0.045,0.428-0.303,1.917-0.687,3.816c-1.373,6.787-4.388,19.788-7.054,32.033c-1.338,6.134-2.595,12.092-3.522,17.077c-0.464,2.497-0.848,4.753-1.124,6.697c-0.277,1.962-0.455,3.558-0.464,5.083c0.009,5.136,0.812,11.12,1.588,15.998c0.597,3.728,1.177,6.724,1.426,7.954c0,1.159,0,3.95,0,7.714c0,15.017,0,45.399,0,48.226c0,0.562-0.062,1.347-0.241,2.105c-0.142,0.562-0.339,1.096-0.588,1.56c-0.402,0.687-0.829,1.186-1.632,1.65c-0.812,0.455-2.14,0.927-4.53,0.927c-4.486,0-7.874-0.668-10.264-1.364l2.96-10.068v-0.838c0,0,0-30.15,0-43.714c-0.009-4.45-1.15-8.927-2.889-13.671c-2.631-7.098-6.706-14.82-11.459-23.239c-4.744-8.4-10.166-17.461-15.48-26.976c-1.364-2.417-2.917-6.368-4.388-10.996c-2.238-6.974-4.388-15.525-6.447-23.73c-2.069-8.23-4.032-16.06-6.082-21.982c-4.886-14.036-12.056-28.634-18.031-39.816c-5.966-11.182-10.737-18.914-10.781-18.985l-1.552-2.515l-2.951-0.232c-14.571-1.115-33.673-3.095-49.867-4.78c-8.098-0.856-15.472-1.632-21.232-2.202c-2.872-0.276-5.342-0.508-7.322-0.678c-1.552-0.125-2.729-0.214-3.728-0.241c-0.214-0.16-0.509-0.401-0.91-0.82c-1.07-1.07-2.479-2.898-3.844-4.994c-2.069-3.148-4.111-6.92-5.574-10.006c-0.633-1.328-1.132-2.487-1.498-3.415c0.276-0.232,0.58-0.473,0.927-0.722c1.392-1.035,3.291-2.229,5.209-3.362c1.916-1.132,3.87-2.22,5.492-3.148c0.919-0.535,1.516-1.035,2.185-1.614c1.213-1.062,2.506-2.382,4.012-3.987c5.19-5.564,12.654-14.553,19.342-22.526c3.335-3.968,6.474-7.669,8.954-10.487c1.239-1.4,2.318-2.586,3.129-3.424c0.411-0.419,0.75-0.758,0.982-0.963l0.24-0.214l0,0c1.034-0.686,3.3-2.122,6.046-3.843c4.227-2.64,9.623-5.975,13.965-8.641c4.343-2.676,7.606-4.682,7.616-4.682l0.526-0.32l0.455-0.428c1.882-1.811,2.926-4.004,3.532-6.135c0.597-2.14,0.802-4.298,0.802-6.492c0-3.407-0.509-6.894-1.276-10.273c-0.642-2.782-1.48-5.413-2.408-7.848c0.428,0.142,0.883,0.33,1.401,0.624c0.32,0.152,1.516,1.098,2.71,2.578c1.846,2.22,3.898,5.573,5.387,9.203c1.507,3.638,2.443,7.562,2.434,10.879c0,1.935-0.295,3.647-0.866,5.101l5.404,2.131l4.37,3.844c6.091-6.893,11.7-8.436,14.928-8.445c0.812-0.009,1.427,0.107,1.854,0.223c0.036,0.169,0.08,0.357,0.116,0.562c0.134,0.758,0.224,1.757,0.224,2.88c0.008,3.336-0.812,7.741-3.085,11.665c-2.301,3.95-5.877,7.562-12.217,10.005l4.128,10.87c5.288-1.989,9.533-4.86,12.832-8.151c1.98,0.054,4.807,0.607,8.248,1.686c5.503,1.703,12.449,4.61,20.51,7.83c8.062,3.22,17.256,6.76,27.466,9.711c14.803,4.281,35.671,8.142,56.136,10.995c20.466,2.845,40.352,4.656,53.3,4.656c8.615,0,18.941,0.053,29.829,0.053c20.466,0,42.866-0.169,59.81-1.168c18.549-1.088,32.737-2.221,44.329-2.212c10.282,0,18.433,0.865,26.102,3.237c7.661,2.382,15.009,6.287,23.649,12.85c3.727,2.898,6.769,6.421,9.301,10.576c3.79,6.234,6.376,13.921,7.972,22.677c1.605,8.757,2.221,18.54,2.221,28.831c0,14.276-1.186,29.517-2.372,44.427c-1.194,14.919-2.407,29.508-2.416,42.644c0.009,7.651,0.419,14.812,1.552,21.34c-0.009,0.179-0.045,0.731-0.133,1.472C496.609,350.391,495.423,356.83,493.88,364.5z"
                fill="none"
                stroke="#faeee8"
                strokeWidth="60"
                strokeLinejoin="round"
              />
            </symbol>
          </defs>
          <use href="#nasceuCowBody" x="7" y="14" width="27" height="27" />
          <use href="#nasceuCowHalo" x="25" y="25" width="16" height="16" />
          <use href="#nasceuCowBody" x="25" y="25" width="16" height="16" />
        </svg>
      </div>
    ),
    label: 'NASCEU',
    subtitle: 'Novo bezerro',
    urgency: 'low',
  },
  {
    id: 'MORREU',
    icon: <AlertOctagon className="w-10 h-10 text-slate-700" />,
    label: 'MORREU',
    subtitle: 'Aviso de campo',
    urgency: 'high',
  },
  {
    id: 'DOENTE',
    icon: <Stethoscope className="w-10 h-10 text-rose-500" />,
    label: 'DOENTE',
    subtitle: 'Animal com atenção',
    urgency: 'high',
  },
  {
    id: 'AVARIA',
    icon: <Wrench className="w-10 h-10 text-orange-500" />,
    label: 'AVARIA',
    subtitle: 'Cerca ou porteira',
    urgency: 'medium',
  },
];

const loadPendingReports = (): PendingReport[] => {
  try {
    const raw = localStorage.getItem(PENDING_REPORTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao ler foto.'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler foto.'));
    reader.readAsDataURL(file);
  });

const formatCoordinateLabel = (lat: number | null, lng: number | null) => {
  if (lat === null || lng === null) {
    return 'Localização indisponível';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
};

const buildAnimalLabel = (animal: Animal) => {
  return animal.brinco || animal.identificacao || animal.name || 'Animal sem identificação';
};

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [activationCode, setActivationCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentProfile, setCurrentProfile] = useState<'VAQUEIRO' | 'ADMIN_CAMPO' | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [screenError, setScreenError] = useState('');
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [selectedPaddockId, setSelectedPaddockId] = useState('');
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [location, setLocation] = useState<{ lat: number | null; lng: number | null; label: string; loading: boolean }>({
    lat: null,
    lng: null,
    label: 'Aguardando localização',
    loading: false,
  });
  const [observations, setObservations] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showAnimalLookup, setShowAnimalLookup] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [animalSearch, setAnimalSearch] = useState('');
  const [pendingReports, setPendingReports] = useState<PendingReport[]>(loadPendingReports);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAction, setLastSyncedAction] = useState<ActionConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getDeviceId = () => {
    try {
      const stored = localStorage.getItem(DEVICE_ID_KEY);
      if (stored) {
        return stored;
      }
      const nextValue = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, nextValue);
      return nextValue;
    } catch {
      return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  };

  useEffect(() => {
    localStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(pendingReports));
  }, [pendingReports]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadFieldContext = async (user: AuthUser) => {
    const defaultFarmId = user.defaultFarmId || user.allowedFarmIds?.[0] || null;
    if (!defaultFarmId) {
      setScreenError('Esse usuário não tem fazenda vinculada.');
      return;
    }

    const [farmsResponse, paddocksResponse, animalsResponse] = await Promise.all([
      apiFetch('/farms', { method: 'GET' }),
      apiFetch(`/pastos?farmId=${encodeURIComponent(defaultFarmId)}`, { method: 'GET' }),
      apiFetch(`/animals?farmId=${encodeURIComponent(defaultFarmId)}`, { method: 'GET' }),
    ]);

    if (!farmsResponse.ok) {
      throw new Error('Falha ao carregar fazendas.');
    }
    if (!paddocksResponse.ok) {
      throw new Error('Falha ao carregar pastos.');
    }
    if (!animalsResponse.ok) {
      throw new Error('Falha ao carregar animais.');
    }

    const farmsPayload = await farmsResponse.json();
    const paddocksPayload = await paddocksResponse.json();
    const animalsPayload = await animalsResponse.json();

    const availableFarms: Farm[] = Array.isArray(farmsPayload?.farms) ? farmsPayload.farms : [];
    setFarm(availableFarms.find((item) => item.id === defaultFarmId) || null);
    setPaddocks(Array.isArray(paddocksPayload?.items) ? paddocksPayload.items : []);
    setAnimals(Array.isArray(animalsPayload?.animals) ? animalsPayload.animals : []);
    setScreenError('');
  };

  const applyAuthenticatedState = async (payload: {
    user?: AuthUser;
    profile?: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
  }) => {
    const user = payload?.user;
    if (!user) {
      throw new Error('Resposta de autenticação inválida.');
    }
    setCurrentUser(user);
    setCurrentProfile(payload.profile || user.fieldProfile || null);
    await loadFieldContext(user);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const baseUrl = await detectApiBaseUrl();
      setApiBaseUrl(baseUrl);
      try {
        if (!getStoredSessionToken()) {
          return;
        }
        const response = await apiFetch('/app/me', { method: 'GET' });
        if (!response.ok) {
          clearStoredSessionToken();
          return;
        }
        const payload = await response.json();
        await applyAuthenticatedState(payload);
      } catch {
        setScreenError(`Não foi possível conectar ao servidor em ${getApiBaseUrl()}.`);
      } finally {
        setIsAuthenticating(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (isOnline && pendingReports.length > 0 && !isSyncing && currentUser && farm) {
      void syncReports();
    }
  }, [isOnline, pendingReports.length, isSyncing, currentUser, farm]);

  const currentActionSummary = useMemo(() => lastSyncedAction || selectedAction, [lastSyncedAction, selectedAction]);
  const filteredAnimals = useMemo(() => {
    const query = animalSearch.trim().toLowerCase();
    if (!query) {
      return animals.slice(0, 20);
    }
    return animals
      .filter((animal) => {
        const label = buildAnimalLabel(animal).toLowerCase();
        return label.includes(query);
      })
      .slice(0, 20);
  }, [animalSearch, animals]);
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const deviceId = getDeviceId();
      const response = await apiFetch('/app/activate', {
        method: 'POST',
        body: JSON.stringify({
          code: activationCode.trim(),
          deviceId,
          deviceFingerprint: deviceId,
          deviceLabel: 'Navegador atual',
          platform: 'WEB',
          appVersion: 'web-prototype',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(payload?.message || 'Não foi possível ativar o app.');
        return;
      }
      if (!payload?.sessionToken) {
        setLoginError('Resposta de ativação inválida.');
        return;
      }
      setStoredSessionToken(payload.sessionToken);
      await applyAuthenticatedState(payload);
      setActivationCode('');
    } catch {
      setLoginError(`Falha ao conectar em ${getApiBaseUrl()}.`);
    } finally {
      setIsAuthenticating(false);
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    clearStoredSessionToken();
    setCurrentUser(null);
    setCurrentProfile(null);
    setFarm(null);
    setPaddocks([]);
    setAnimals([]);
    setActivationCode('');
    closeModals();
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocation({
        lat: null,
        lng: null,
        label: 'GPS indisponível neste aparelho',
        loading: false,
      });
      return;
    }

    setLocation({
      lat: null,
      lng: null,
      label: 'Capturando localização...',
      loading: true,
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setLocation({
          lat,
          lng,
          label: formatCoordinateLabel(lat, lng),
          loading: false,
        });
      },
      () => {
        setLocation({
          lat: null,
          lng: null,
          label: 'Não foi possível capturar a localização',
          loading: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 15000,
      },
    );
  };

  const handleActionClick = (action: ActionConfig) => {
    setSelectedAction(action);
    setSelectedPaddockId('');
    setSelectedAnimalId('');
    setPhotos([]);
    setObservations('');
    setSubmitError('');
    requestLocation();
  };

  const handleSelectPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (!files.length) {
      return;
    }

    const remainingSlots = Math.max(0, 3 - photos.length);
    const filesToRead = files.slice(0, remainingSlots);
    const nextPhotos: PendingPhoto[] = [];

    for (const file of filesToRead) {
      // eslint-disable-next-line no-await-in-loop
      const contentBase64 = await readFileAsDataUrl(file);
      nextPhotos.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name || `foto-${Date.now()}.jpg`,
        mimeType: file.type || 'image/jpeg',
        contentBase64,
      });
    }

    setPhotos((prev) => [...prev, ...nextPhotos].slice(0, 3));
    event.target.value = '';
  };

  const handleSubmit = () => {
    if (!selectedAction || !farm) {
      return;
    }
    if (photos.length === 0) {
      setSubmitError('Envie pelo menos uma foto.');
      return;
    }
    if ((selectedAction.id === 'NASCEU' || selectedAction.id === 'MORREU') && !selectedAnimalId) {
      setSubmitError(selectedAction.id === 'NASCEU' ? 'Selecione a mãe.' : 'Selecione o animal.');
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    const newReport: PendingReport = {
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      farmId: farm.id,
      type: selectedAction.id,
      description: observations.trim(),
      animalId: selectedAnimalId || null,
      paddockId: selectedPaddockId || null,
      occurredAt: new Date().toISOString(),
      offlineCreatedAt: new Date().toISOString(),
      lat: location.lat,
      lng: location.lng,
      locationLabel: location.label,
      photos,
      remoteOccurrenceId: null,
      uploadedPhotoIds: [],
      syncError: null,
    };

    setPendingReports((prev) => [...prev, newReport]);

    setTimeout(() => {
      setLastSyncedAction(selectedAction);
      setIsSubmitting(false);
      setShowSuccess(true);
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }, 400);
  };

  const syncReports = async () => {
    if (!pendingReports.length) {
      return;
    }

    setIsSyncing(true);

    for (const report of pendingReports) {
      try {
        let remoteOccurrenceId = report.remoteOccurrenceId;

        if (!remoteOccurrenceId) {
          const createResponse = await apiFetch('/field-occurrences', {
            method: 'POST',
            body: JSON.stringify({
              farmId: report.farmId,
              type: report.type,
              description: report.description,
              animalId: report.animalId,
              paddockId: report.paddockId,
              occurredAt: report.occurredAt,
              lat: report.lat,
              lng: report.lng,
              offlineCreatedAt: report.offlineCreatedAt,
              syncSource: report.localId,
              photoCount: report.photos.length,
            }),
          });
          const createPayload = await createResponse.json().catch(() => ({}));
          if (!createResponse.ok) {
            throw new Error(createPayload?.message || 'Falha ao enviar ocorrência.');
          }

          remoteOccurrenceId = createPayload?.occurrence?.id || null;
          if (!remoteOccurrenceId) {
            throw new Error('Servidor não devolveu o id da ocorrência.');
          }

          setPendingReports((prev) =>
            prev.map((item) =>
              item.localId === report.localId
                ? { ...item, remoteOccurrenceId, syncError: null }
                : item,
            ),
          );
        }

        for (const photo of report.photos) {
          if (report.uploadedPhotoIds.includes(photo.id)) {
            continue;
          }

          const attachmentResponse = await apiFetch(`/field-occurrences/${remoteOccurrenceId}/attachments`, {
            method: 'POST',
            body: JSON.stringify(photo),
          });
          const attachmentPayload = await attachmentResponse.json().catch(() => ({}));
          if (!attachmentResponse.ok) {
            throw new Error(attachmentPayload?.message || 'Falha ao enviar foto.');
          }

          setPendingReports((prev) =>
            prev.map((item) =>
              item.localId === report.localId
                ? {
                    ...item,
                    uploadedPhotoIds: item.uploadedPhotoIds.includes(photo.id)
                      ? item.uploadedPhotoIds
                      : [...item.uploadedPhotoIds, photo.id],
                    syncError: null,
                  }
                : item,
            ),
          );
        }

        setPendingReports((prev) => prev.filter((item) => item.localId !== report.localId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao sincronizar.';
        setPendingReports((prev) =>
          prev.map((item) =>
            item.localId === report.localId
              ? { ...item, syncError: message }
              : item,
          ),
        );
        break;
      }
    }

    setIsSyncing(false);
  };

  const closeModals = () => {
    setShowDiscardConfirm(false);
    setSelectedAction(null);
    setShowSuccess(false);
    setShowFAQ(false);
    setShowAnimalLookup(false);
    setAnimalSearch('');
    setPhotos([]);
    setObservations('');
    setSelectedPaddockId('');
    setSelectedAnimalId('');
    setSubmitError('');
    setLocation({
      lat: null,
      lng: null,
      label: 'Aguardando localização',
      loading: false,
    });
    setLastSyncedAction(null);
  };

  const hasUnsavedDraft = () => {
    if (showSuccess || showFAQ) {
      return false;
    }
    if (showAnimalLookup) {
      return false;
    }
    if (!selectedAction) {
      return false;
    }
    return Boolean(
      observations.trim()
      || selectedPaddockId
      || selectedAnimalId
      || photos.length > 0,
    );
  };

  const requestCloseModals = () => {
    if (hasUnsavedDraft()) {
      setShowDiscardConfirm(true);
      return;
    }
    closeModals();
  };

  const getAnimalFieldLabel = () => {
    if (selectedAction?.id === 'NASCEU') return 'Mãe (obrigatório)';
    if (selectedAction?.id === 'MORREU') return 'Animal (obrigatório)';
    return 'Animal (opcional)';
  };

  const getObservationPlaceholder = () => {
    switch (selectedAction?.id) {
      case 'NASCEU':
        return 'Informe a identificação da mãe e detalhes do nascimento...';
      case 'AVARIA':
        return 'Informe o local e descreva a avaria...';
      case 'MORREU':
        return 'Descreva o ocorrido e qualquer detalhe importante...';
      case 'DOENTE':
        return 'Descreva os sintomas e a situação observada...';
      case 'COCHO':
        return 'Descreva a situação do cocho...';
      case 'AGUA':
        return 'Descreva a situação da água ou bebedouro...';
      default:
        return 'Descreva o que aconteceu...';
    }
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-[#f5f5f4] flex items-center justify-center p-6">
        <div className="bg-white border border-[#e7e5e4] rounded-[2rem] p-8 shadow-xl flex flex-col items-center gap-4 w-full max-w-sm">
          <LoaderCircle className="w-10 h-10 animate-spin text-[#a8442a]" />
          <div className="text-center">
            <div className="font-bold text-stone-800">Conectando ao EIXO</div>
            <div className="text-sm text-[#78716c] mt-1">{apiBaseUrl || 'Detectando servidor...'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#f5f5f4] flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white border border-[#e7e5e4] rounded-[2rem] p-8 shadow-xl">
          <img src="/logo_eixo_black.svg" alt="EIXO" className="h-11 mb-6" />
          <h1 className="text-2xl font-bold text-[#1c1917]">Ativar App do Manejo</h1>
          <p className="text-sm text-[#78716c] mt-2">Use o código de ativação entregue pela fazenda para liberar este aparelho. Um novo código só será necessário se a fazenda gerar uma nova ativação.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-[#78716c] uppercase tracking-wider">Código de ativação</span>
              <input
                type="text"
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                className="mt-2 w-full border border-[#e7e5e4] rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#a8442a]"
                placeholder="Ex.: AB12-CD34-EF56"
                required
              />
            </label>
          </div>

          {loginError && (
            <div className="mt-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3 text-sm">
              {loginError}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-[#e7e5e4] bg-[#f5f5f4] px-4 py-3 text-xs leading-relaxed text-[#78716c]">
            Os registros enviados pelo app incluem data, hora, e localização do aparelho assim que houver o registro para controle operacional da fazenda.
          </div>

          <div className="mt-4 text-xs text-[#78716c] break-all">API detectada: {apiBaseUrl || getApiBaseUrl()}</div>

          <button type="submit" disabled={isLoggingIn} className="mt-6 w-full py-4 bg-[#a8442a] text-white rounded-2xl font-bold hover:bg-[#933a22] disabled:opacity-70">
            {isLoggingIn ? 'Ativando...' : 'ATIVAR APP'}
          </button>
        </form>
      </div>
    );
  }

  const modalVisible = Boolean(selectedAction || showSuccess || showFAQ || showAnimalLookup);

  return (
    <div className="min-h-screen bg-[#f5f5f4] flex items-center justify-center p-4 font-sans text-stone-900">
      <div className="relative w-full max-w-[400px] h-[800px] bg-black rounded-[3rem] p-3 shadow-2xl border-4 border-stone-800 overflow-hidden">
        <div className="relative w-full h-full bg-white rounded-[2.2rem] overflow-hidden flex flex-col">
          <div className="bg-[#1c1917] text-white px-6 pt-10 pb-2 flex justify-between items-center text-xs font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-end gap-0.5 h-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-0.5 bg-[#a8442a] rounded-full" style={{ height: `${i * 25}%` }} />
                ))}
              </div>
              <span className="truncate">{farm?.name || 'Fazenda vinculada'}</span>
            </div>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isOnline ? 'bg-[#a8442a]' : 'bg-amber-500'}`}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="uppercase tracking-wider text-[10px]">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div className="bg-[#1c1917] text-white p-6 shadow-lg relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img src="/logo_eixo_white.svg" alt="EIXO" className="h-7" />
                <div className="w-px h-6 bg-white/20 mx-1" />
                <h1 className="text-xl font-bold tracking-tight">App de Manejo</h1>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-full bg-white/10 border border-white/10">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-white/80 text-sm min-w-0 truncate">{currentUser.name}</p>
              <div className="shrink-0 rounded-full bg-[#faeee8] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a8442a]">
                {currentProfile === 'ADMIN_CAMPO' ? 'Admin de Campo' : 'Vaqueiro'}
              </div>
            </div>

            {(isSyncing || pendingReports.length > 0) && (
              <div className="absolute right-6 bottom-6 flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                {isSyncing ? <RefreshCw className="w-3 h-3 text-[#faeee8] animate-spin" /> : <Cloud className="w-3 h-3 text-[#faeee8]" />}
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {isSyncing ? 'Sincronizando...' : `${pendingReports.length} pendente(s)`}
                </span>
              </div>
            )}
          </div>

          {screenError && (
            <div className="mx-5 mt-5 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3 text-sm">
              {screenError}
            </div>
          )}

          <div className="flex-1 px-5 pt-2 pb-20 grid grid-cols-2 gap-2 auto-rows-[122px] overflow-y-auto">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                className="bg-white border border-stone-200 rounded-3xl px-3.5 py-3.5 flex flex-col items-center justify-between text-center shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div
                  className={`absolute top-3 right-3 w-4 h-4 rounded-full ${
                    action.urgency === 'high'
                      ? 'bg-rose-500 animate-pulse'
                      : action.urgency === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-[#a8442a]'
                  }`}
                />
                <div className="w-14 h-14 min-w-[56px] min-h-[56px] bg-stone-50 rounded-2xl flex items-center justify-center group-hover:bg-stone-100 transition-colors">
                  {action.icon}
                </div>
                <div className="min-h-[32px] flex flex-col items-center justify-start">
                  <div className="font-bold text-stone-800 tracking-tight leading-none">{action.label}</div>
                  {action.subtitle && <div className="mt-1 text-[9px] leading-tight text-stone-400 uppercase font-bold tracking-[0.14em]">{action.subtitle}</div>}
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowAnimalLookup(true)}
              className="col-span-2 bg-white border border-stone-200 rounded-3xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center text-[#a8442a]">
                <Search className="w-7 h-7" />
              </div>
              <div className="text-left">
                <div className="font-bold text-stone-800 tracking-tight leading-none">CONSULTAR ANIMAL</div>
                <div className="text-[9px] text-stone-400 uppercase font-bold tracking-[0.14em] mt-1">Confirmar no pasto</div>
              </div>
            </button>
          </div>

          <button className="absolute bottom-6 right-6 w-14 h-14 bg-[#1c1917] text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform z-10" onClick={() => setShowFAQ(true)}>
            <HelpCircle className="w-7 h-7" />
          </button>
        </div>

        {modalVisible && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
            <div className={`w-full bg-white rounded-[2.5rem] shadow-2xl max-h-[90%] ${selectedAction ? 'overflow-hidden p-5 pb-6' : 'overflow-y-auto p-8 pb-12'}`}>
              {showFAQ ? (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-stone-800">Perguntas Frequentes</h2>
                      <p className="text-sm text-[#78716c]">Ajuda do app de manejo</p>
                    </div>
                    <button onClick={requestCloseModals} className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-600">
                      Voltar
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <h3 className="font-bold text-stone-800 text-sm mb-1">Como funciona sem internet?</h3>
                      <p className="text-sm text-stone-600">O registro fica salvo no aparelho e tenta sincronizar quando a internet volta.</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <h3 className="font-bold text-stone-800 text-sm mb-1">Nasceu e Morreu fazem baixa automática?</h3>
                      <p className="text-sm text-stone-600">Não. Na primeira versão, esses dois tipos entram como aviso para revisão do gestor.</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <h3 className="font-bold text-stone-800 text-sm mb-1">Quantas fotos posso enviar?</h3>
                      <p className="text-sm text-stone-600">Até 3 fotos por ocorrência.</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <h3 className="font-bold text-stone-800 text-sm mb-1">O app registra localização?</h3>
                      <p className="text-sm text-stone-600">Para auditoria e rastreabilidade operacional, os registros feitos no app incluem data, hora, e localização do aparelho no momento do envio ou do registro.</p>
                    </div>
                  </div>

                  <button onClick={closeModals} className="mt-6 w-full py-4 bg-[#1c1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-colors">
                    ENTENDIDO
                  </button>
                </div>
              ) : showSuccess ? (
                <div className="text-center py-8">
                  <div className="w-24 h-24 bg-[#faeee8] text-[#a8442a] rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-14 h-14" />
                  </div>
                  <h2 className="text-2xl font-bold text-stone-800">Registro guardado</h2>
                  <div className="mt-6 p-4 bg-stone-50 rounded-2xl text-left border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Resumo</div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-stone-200 shadow-sm">
                        {currentActionSummary?.icon}
                      </div>
                      <div>
                        <div className="font-bold text-stone-700 leading-none">{currentActionSummary?.label}</div>
                        <div className="text-[10px] text-stone-400 font-bold mt-1 uppercase">
                          {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
                        </div>
                      </div>
                    </div>
                    {observations && <div className="text-sm text-stone-600 italic bg-white p-3 rounded-xl border border-stone-100">"{observations}"</div>}
                  </div>
                  <p className="mt-4 text-stone-500">{isOnline ? 'O sistema vai sincronizar agora.' : 'Sem sinal. O envio ficará pendente.'}</p>
                  <button onClick={closeModals} className="mt-10 w-full py-4 bg-[#1c1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-colors">
                    ENTENDIDO
                  </button>
                </div>
              ) : showAnimalLookup ? (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-stone-800">Consultar Animal</h2>
                      <p className="text-sm text-stone-500">Consulte o rebanho da fazenda para confirmar o animal no pasto.</p>
                    </div>
                    <button onClick={requestCloseModals} className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-600">
                      Voltar
                    </button>
                  </div>

                  <label className="block">
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Buscar por brinco, identificação ou nome</span>
                    <div className="mt-2 relative">
                      <Search className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={animalSearch}
                        onChange={(event) => setAnimalSearch(event.target.value)}
                        placeholder="Ex.: 1458, FIV 22, Matriz 08"
                        className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#a8442a]"
                      />
                    </div>
                  </label>

                  <div className="mt-5 space-y-3 overflow-y-auto">
                    {filteredAnimals.length > 0 ? (
                      filteredAnimals.map((animal) => (
                        <div key={animal.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                          <div className="font-bold text-stone-800">{buildAnimalLabel(animal)}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                            {animal.brinco && <span className="rounded-full bg-white px-3 py-1 border border-stone-200">Brinco: {animal.brinco}</span>}
                            {animal.identificacao && <span className="rounded-full bg-white px-3 py-1 border border-stone-200">Identificação: {animal.identificacao}</span>}
                            {animal.name && <span className="rounded-full bg-white px-3 py-1 border border-stone-200">Nome: {animal.name}</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                        Nenhum animal encontrado para essa busca.
                      </div>
                    )}
                  </div>

                  <button onClick={closeModals} className="mt-6 w-full py-4 bg-[#1c1917] text-white rounded-2xl font-bold hover:bg-[#292524] transition-colors">
                    VOLTAR
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100">{selectedAction?.icon}</div>
                      <div>
                        <h2 className="whitespace-nowrap text-lg font-bold text-stone-800">{selectedAction?.label}</h2>
                        <p className="whitespace-nowrap text-xs text-stone-500">{selectedAction?.subtitle}</p>
                      </div>
                    </div>
                    <button onClick={requestCloseModals} className="shrink-0 rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-600">
                      Voltar
                    </button>
                  </div>

                  <div className="mb-4 flex flex-col gap-2.5">
                    <label className="block">
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Pasto (opcional)</span>
                      <select value={selectedPaddockId} onChange={(event) => setSelectedPaddockId(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#a8442a]">
                        <option value="">Selecione um pasto</option>
                        {paddocks.map((paddock) => (
                          <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                        ))}
                      </select>
                    </label>

                    {selectedAction?.id !== 'COCHO' && selectedAction?.id !== 'AGUA' && selectedAction?.id !== 'AVARIA' && (
                      <label className="block">
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">{getAnimalFieldLabel()}</span>
                        <select value={selectedAnimalId} onChange={(event) => setSelectedAnimalId(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#a8442a]">
                          <option value="">{selectedAction?.id === 'NASCEU' ? 'Selecione a mãe' : 'Selecione um animal'}</option>
                          {animals.map((animal) => (
                            <option key={animal.id} value={animal.id}>{buildAnimalLabel(animal)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest">Observações</label>
                        <span className="text-[10px] font-bold text-stone-300">{observations.length}/500</span>
                      </div>
                      <textarea
                        value={observations}
                        onChange={(event) => setObservations(event.target.value.slice(0, 500))}
                        placeholder={getObservationPlaceholder()}
                        className="min-h-[84px] w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#a8442a]"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-stone-400">Fotos</label>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" multiple onChange={handleSelectPhotos} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={photos.length >= 3} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3.5 text-sm font-bold whitespace-nowrap text-white transition-all hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400">
                        <Camera className="h-5 w-5" />
                        <span>{photos.length === 0 ? 'Adicionar foto' : `Adicionar foto (${photos.length}/3)`}</span>
                      </button>

                      <div className="mt-3 grid grid-cols-3 gap-2.5">
                        {[0, 1, 2].map((index) => (
                          <div key={index} className={`aspect-square rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${
                            photos[index]
                              ? 'bg-[#faeee8] border-[#f1c9bb] text-[#a8442a]'
                              : 'bg-stone-50 border-stone-200 text-stone-300'
                          }`}>
                            {photos[index] ? <CheckCircle2 className="w-8 h-8" /> : <Camera className="w-6 h-6" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {submitError && (
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        {submitError}
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button onClick={requestCloseModals} className="flex-1 rounded-2xl bg-stone-100 py-3.5 text-sm font-bold whitespace-nowrap text-stone-600">CANCELAR</button>
                      <button
                        disabled={photos.length === 0 || isSubmitting}
                        onClick={handleSubmit}
                        className="flex-[2] rounded-2xl bg-[#a8442a] py-3.5 text-sm font-bold whitespace-nowrap text-white shadow-lg shadow-[#f1c9bb] transition-all hover:bg-[#933a22] disabled:bg-stone-200 disabled:shadow-none flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>ENVIAR RELATÓRIO <ChevronRight className="w-5 h-5" /></>}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-5">
            <div className="w-full rounded-[2rem] bg-white p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-stone-800">Sair sem salvar?</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                As informações preenchidas nesta tela serão descartadas.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 rounded-2xl bg-stone-100 py-4 font-bold text-stone-600"
                >
                  Continuar editando
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 rounded-2xl bg-[#8c4d39] py-4 font-bold text-white"
                >
                  Sair sem salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
