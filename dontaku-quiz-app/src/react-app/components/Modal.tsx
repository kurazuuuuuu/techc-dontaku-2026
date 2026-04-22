import type { ReactNode } from "react";

type ModalProps = {
	children: ReactNode;
	onClose: () => void;
	title: string;
};

export function Modal({ children, onClose, title }: ModalProps) {
	return (
		<div className="modal-overlay" role="presentation" onClick={onClose}>
			<section
				className="modal-card"
				role="dialog"
				aria-modal="true"
				aria-label={title}
				onClick={(event) => event.stopPropagation()}
			>
				<div className="modal-header">
					<h2>{title}</h2>
					<button
						type="button"
						className="modal-close"
						onClick={onClose}
						aria-label="モーダルを閉じる"
					>
						×
					</button>
				</div>
				<div className="modal-body">{children}</div>
			</section>
		</div>
	);
}
