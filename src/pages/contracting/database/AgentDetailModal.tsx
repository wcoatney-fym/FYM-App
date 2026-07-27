/**
 * AgentDetailModal — View agent details, form submission, files, LOB
 *
 * Ported from the detail modal in contracting-portal/src/pages/AgentDatabase.tsx
 * Reads from portal Supabase (akhojh…) during parallel-run period.
 */
import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { formatPhoneDisplay } from '@/lib/contracting/helpers';
import type {
  PortalAgent,
  PortalIntakeRecord,
  PortalUploadedFile,
} from '@/lib/contracting/types';
import { LobAssignment } from './LobAssignment';

interface AgentDetailModalProps {
  agent: PortalAgent;
  submission: PortalIntakeRecord | null;
  onClose: () => void;
}

export function AgentDetailModal({
  agent,
  submission,
  onClose,
}: AgentDetailModalProps) {
  const [files, setFiles] = useState<PortalUploadedFile[]>([]);

  useEffect(() => {
    if (!portalSupabase) return;
    (async () => {
      const { data } = await portalSupabase
        .from('uploaded_files')
        .select('*')
        .eq('agent_id', agent.id);
      setFiles((data as PortalUploadedFile[]) || []);
    })();
  }, [agent.id]);

  const downloadFile = (file: PortalUploadedFile) => {
    const link = document.createElement('a');
    link.href = file.file_data;
    link.download = file.file_name;
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-navy-600">Agent Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-navy-600 text-lg mb-4">
              Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Agent Name:</span>
                <p className="font-medium">
                  {agent.first_name} {agent.last_name}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Email:</span>
                <p className="font-medium">{agent.email}</p>
              </div>
              <div>
                <span className="text-gray-600">Phone Number:</span>
                <p className="font-medium">
                  {formatPhoneDisplay(agent.phone)}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Security Code:</span>
                <p className="font-medium font-mono">{agent.security_code}</p>
              </div>
              <div>
                <span className="text-gray-600">Form Type:</span>
                <p className="font-medium capitalize">
                  {agent.form_type.replace('-', ' ')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Date Completed:</span>
                <p className="font-medium">
                  {agent.date_completed
                    ? new Date(agent.date_completed).toLocaleDateString()
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Lines of Business */}
          <LobAssignment
            agentId={agent.id}
            agentFirstName={agent.first_name}
            agentLastName={agent.last_name}
            agentNpn={submission?.npn || ''}
          />

          {/* Form Submission Data */}
          {submission && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-navy-600 text-lg mb-4">
                Form Submission Data
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {submission.agent_type && (
                  <div>
                    <span className="text-gray-600">Agent Type:</span>
                    <p className="font-medium">{submission.agent_type}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Date of Birth:</span>
                  <p className="font-medium">{submission.date_of_birth}</p>
                </div>
                <div>
                  <span className="text-gray-600">
                    Social Security Number:
                  </span>
                  <p className="font-medium font-mono">
                    {submission.ssn.slice(0, 3)}-
                    {submission.ssn.slice(3, 5)}-
                    {submission.ssn.slice(5, 9)}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Address:</span>
                  <p className="font-medium">
                    {submission.address}, {submission.city},{' '}
                    {submission.state} {submission.postal_code}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">
                    Resident License Number:
                  </span>
                  <p className="font-medium">
                    {submission.resident_license_number}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">NPN:</span>
                  <p className="font-medium">{submission.npn}</p>
                </div>
                <div>
                  <span className="text-gray-600">Your Resident State:</span>
                  <p className="font-medium">{submission.resident_state}</p>
                </div>
                {submission.ctm_acknowledgment && (
                  <div>
                    <span className="text-gray-600">CTM Acknowledgment:</span>
                    <p className="font-medium">
                      {submission.ctm_acknowledgment}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Release Needed:</span>
                  <p className="font-medium">{submission.release_needed}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">
                    Selected State Licenses:
                  </span>
                  <p className="font-medium">
                    {submission.state_licenses.join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Uploaded Files */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-navy-600 text-lg mb-4">
              Uploaded Files
            </h3>
            {files.length > 0 ? (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-white rounded border"
                  >
                    <div>
                      <p className="font-medium">{file.file_name}</p>
                      <p className="text-sm text-gray-600">
                        {file.file_type}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFile(file)}
                      className="flex items-center text-navy-600 hover:text-navy-700 font-medium"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                No files uploaded
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
