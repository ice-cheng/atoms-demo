import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  BookOpen,
  BarChart3,
  Rocket,
  Calculator,
  Cloud,
  Users,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { templates } from '@client/src/api';
import type { Template } from '@shared/api.interface';
import { Card, CardContent, CardFooter } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  todo: CheckSquare,
  blog: BookOpen,
  dashboard: BarChart3,
  landing: Rocket,
  calculator: Calculator,
  weather: Cloud,
  team: Users,
  pricing: Tag,
};

const templateGradients: Record<string, string> = {
  todo: 'from-blue-400 to-cyan-500',
  blog: 'from-violet-500 to-purple-600',
  dashboard: 'from-emerald-400 to-teal-500',
  landing: 'from-orange-400 to-red-500',
  calculator: 'from-slate-500 to-slate-700',
  weather: 'from-sky-400 to-blue-500',
  team: 'from-pink-400 to-rose-500',
  pricing: 'from-amber-400 to-orange-500',
};

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const allTemplates: Template[] = templates.templates;

  const handleUseTemplate = (templateId: string) => {
    const description = templates.getTemplateDescription(templateId);
    navigate('/dashboard/new', {
      state: { templateId, description },
    });
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-3">
            模板库
          </h1>
          <p className="text-lg text-muted-foreground">
            从精选模板开始，快速构建你的应用
          </p>
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {allTemplates.map((template: Template) => {
            const Icon = templateIcons[template.id] || Rocket;
            const gradient = templateGradients[template.id] || 'from-violet-500 to-purple-600';

            return (
              <Card
                key={template.id}
                className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col"
              >
                {/* Preview area */}
                <div
                  className={`h-36 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px]" />
                  <Icon className="w-14 h-14 text-white drop-shadow-md relative z-10" />
                  {/* Decorative circles */}
                  <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/10" />
                </div>

                <CardContent className="flex-1 pt-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {template.name}
                    </h3>
                  </div>
                  <Badge variant="secondary" className="mb-3">
                    {template.category}
                  </Badge>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {template.description}
                  </p>
                </CardContent>

                <CardFooter className="pt-0">
                  <Button
                    className="w-full"
                    onClick={() => handleUseTemplate(template.id)}
                  >
                    使用此模板
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TemplatesPage;
