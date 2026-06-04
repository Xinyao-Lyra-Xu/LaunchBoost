interface Props {
  isOpen: boolean;
  onClose(): void;
}

/**
 * First-use "why the wheel works" explainer (version A — startup modal).
 * Shown once on first launch (gated by localStorage in App), and reopenable
 * from the rules panel. Goal: dispel the "is this random wheel a gimmick?"
 * doubt before the user starts, not to explain features.
 */
export function OnboardingModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content onboarding-content">
        <div className="modal-emoji">🎯</div>
        <h2 className="modal-title">为什么是转盘，不是待办清单？</h2>
        <div className="onboarding-body">
          <p>
            因为「决定做哪个」本身就会消耗你的意志力——心理学把这叫做
            <strong>决策疲劳</strong>。清单越长，启动越难。
          </p>
          <p>转盘把选择权拿走，交给随机性。你只需要做一件事：转它。</p>
          <p>
            研究显示，提前把「我要做 X」具体化（哪怕是被随机选中的），完成率会显著提升。这叫
            <strong>执行意图</strong>，是目前干预拖延最有效的方法之一。
          </p>
          <p className="onboarding-punch">转盘做的，就是替你形成这个意图。</p>
        </div>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            了解了，开始转吧
          </button>
        </div>
        <p className="onboarding-cite">基于执行意图理论（Gollwitzer, 1999）</p>
      </div>
    </div>
  );
}
