import type { Task, User } from '../src/types'

/**
 * Dados iniciais baseados no relatório "Simulador de memória RAM" (cronograma de 8 semanas).
 *
 * Análise de dependências (Finish-to-Start):
 *  - Termo de abertura → Revisão teórica → Planejamento → Estrutura inicial/escrita
 *  - Leitura e Visualização completa dependem da estrutura (e podem ocorrer em paralelo)
 *  - Tratamento de endereços inválidos/vazios depende da operação de leitura
 *  - Menu interativo integra leitura, tratamento de erros e visualização
 *  - Testes dependem do menu (integração completa)
 *  - Organização do código/GitHub e Relatório/apresentação dependem dos testes
 *  - Emissão do TEP depende de ambos (encerramento)
 */
export const SEED_USERS: User[] = [
  { id: 'cf', name: 'Caio Ferreira Sousa', color: '#2f6fe0' },
  { id: 'dl', name: 'Danilo Nava Soares Lima', color: '#7b4fd6' },
  { id: 'ra', name: 'Raynara Ribeiro Alves', color: '#e8772e' },
  { id: 'rs', name: 'Rhuã Yuri Nascimento Sardinha', color: '#14919b' },
  { id: 'yg', name: 'Yuri Aguiar Gonçalves', color: '#c2417a' },
]

function t(
  id: string,
  title: string,
  description: string,
  start: string,
  end: string,
  status: Task['status'],
  assigneeIds: string[],
  preds: string[] = [],
): Task {
  return {
    id,
    title,
    description,
    start,
    end,
    status,
    assigneeIds,
    predecessors: preds.map((taskId) => ({ taskId, type: 'FS' as const })),
  }
}

export const SEED_TASKS: Task[] = [
  t('t01', 'Termo de abertura de projeto', 'Documento que formaliza o projeto: objetivo, escopo, equipe e cronograma.', '2026-08-19', '2026-08-21', 'done', ['cf', 'dl', 'ra', 'rs', 'yg']),
  t('t02', 'Revisão teórica sobre memória RAM e endereçamento', 'Semana 1: revisão sobre memória RAM, endereçamento, leitura, escrita e organização dos dados.', '2026-08-24', '2026-08-28', 'done', ['rs', 'yg'], ['t01']),
  t('t03', 'Planejamento do programa e definição da estrutura da memória', 'Semana 2: planejamento do programa e definição da estrutura da memória (256 posições, 8 bits).', '2026-08-31', '2026-09-04', 'done', ['ra', 'cf'], ['t02']),
  t('t04', 'Implementação da estrutura inicial da memória e da operação de escrita', 'Semana 3: struct MemoriaRAM, vetores de dados/ocupação e escrita com sobrescrita. Sofreu atraso por discussões de arquitetura e design.', '2026-09-07', '2026-09-16', 'done', ['dl', 'yg'], ['t03']),
  t('t05', 'Implementação da operação de leitura', 'Semana 4: leitura consultando o estado da célula antes de retornar o dado.', '2026-09-17', '2026-09-23', 'done', ['cf', 'ra'], ['t04']),
  t('t06', 'Tratamento de endereços inválidos ou vazios', 'Semana 4: validação de endereços (0 a 255) e valores de 8 bits; tratamento de células vazias.', '2026-09-24', '2026-09-28', 'done', ['cf', 'ra'], ['t05']),
  t('t07', 'Implementação da visualização completa do estado da memória', 'Semana 5: mapa de memória listando apenas endereços utilizados, estatísticas e reset.', '2026-09-17', '2026-09-25', 'done', ['dl', 'rs'], ['t04']),
  t('t08', 'Desenvolvimento do menu interativo no terminal e integração das operações', 'Semana 6: menu em laço do-while, tratamento de scanf e limpar_buffer; integra todas as operações.', '2026-09-29', '2026-10-06', 'done', ['yg', 'rs'], ['t06', 't07']),
  t('t09', 'Testes completos: escrita, leitura, sobrescrita, endereço inválido e memória vazia', 'Semana 7: bateria de testes de todos os cenários.', '2026-10-07', '2026-10-12', 'done', ['cf', 'dl'], ['t08']),
  t('t10', 'Organização do código, documentação e GitHub', 'Semana 8: organização do repositório, comentários e README.', '2026-10-13', '2026-10-20', 'in_progress', ['ra', 'yg'], ['t09']),
  t('t11', 'Relatório e apresentação', 'Semana 8: redação do relatório de execução e preparação da apresentação.', '2026-10-13', '2026-10-22', 'in_progress', ['rs', 'dl'], ['t09']),
  t('t12', 'Emissão do TEP', 'Termo de Encerramento do Projeto, após a conclusão do código e do relatório.', '2026-10-23', '2026-10-26', 'pending', ['cf', 'dl', 'ra', 'rs', 'yg'], ['t10', 't11']),
]
