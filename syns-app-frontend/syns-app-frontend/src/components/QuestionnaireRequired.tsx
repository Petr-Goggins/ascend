import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

export default function QuestionnaireRequired() {
  return (
    <div className="card-modern flex flex-col items-start gap-3 border-accent-blue/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-0.5 shrink-0 text-accent-blue" size={20} />
        <div>
          <p className="font-semibold text-text">Сначала заполните анкету</p>
          <p className="mt-1 text-sm text-text-secondary">
            Это поможет подготовить план и корректно вести дневник калорий.
          </p>
        </div>
      </div>
      <Link to="/coach" className="btn-primary shrink-0 px-4 py-2 text-sm">
        Перейти к анкете
      </Link>
    </div>
  );
}
