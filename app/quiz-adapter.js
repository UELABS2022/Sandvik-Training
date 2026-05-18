(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SandvikQuizAdapter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function bySortThenName(a, b) {
    return (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || ''));
  }

  function rowsToQuizBank(rows) {
    const sections = [...(rows.sections || [])].sort(bySortThenName).map((section) => ({
      id: section.id,
      name: section.name,
      icon: section.icon || 'drill',
      description: section.description || '',
      quizSets: [],
      totalQuestions: 0,
    }));
    const sectionById = new Map(sections.map((s) => [s.id, s]));
    const answerByQuestion = new Map((rows.answers || []).map((a) => [a.question_id, a]));
    const questionsBySet = new Map();
    for (const q of rows.questions || []) {
      const answer = answerByQuestion.get(q.id);
      const item = {
        id: q.id,
        question: q.question_text,
        answer: answer ? answer.answer_text : '',
        hasAnswer: Boolean(answer && answer.has_answer),
        source: q.source_manual || '',
        difficulty: q.difficulty || 'medium',
      };
      if (!questionsBySet.has(q.quiz_set_id)) questionsBySet.set(q.quiz_set_id, []);
      questionsBySet.get(q.quiz_set_id).push(item);
    }
    const quizSets = [...(rows.quiz_sets || [])].sort(bySortThenName);
    for (const qs of quizSets) {
      const questions = questionsBySet.get(qs.id) || [];
      const target = sectionById.get(qs.section_id);
      if (!target) continue;
      target.quizSets.push({
        id: qs.id,
        name: qs.name,
        description: qs.description || '',
        questionCount: questions.length,
        answeredCount: questions.filter((q) => q.hasAnswer).length,
        questions,
      });
      target.totalQuestions += questions.length;
    }
    const totalQuestions = sections.reduce((sum, s) => sum + s.totalQuestions, 0);
    const totalAnswered = sections.reduce((sum, s) => sum + s.quizSets.reduce((qSum, qs) => qSum + qs.answeredCount, 0), 0);
    const totalQuizSets = sections.reduce((sum, s) => sum + s.quizSets.length, 0);
    return {
      version: 1,
      generated: new Date().toISOString(),
      generator: 'supabase-cache',
      stats: { totalQuestions, totalAnswered, totalQuizSets, totalSections: sections.length },
      sections,
    };
  }

  return { rowsToQuizBank };
});
