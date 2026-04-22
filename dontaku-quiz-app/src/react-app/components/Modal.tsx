import type { ReactNode } from "react";
import { motion } from "motion/react";

type ModalProps = {
	children: ReactNode;
	onClose: () => void;
	title: string;
};

export function Modal({ children, onClose, title }: ModalProps) {
	return (
		<div className="modal-overlay" role="presentation" onClick={onClose}>
			<motion.section
				className="modal-card"
				role="dialog"
				aria-modal="true"
				aria-label={title}
				onClick={(event) => event.stopPropagation()}
				initial={{ opacity: 0, scale: 0.96, y: 12 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={{ opacity: 0, scale: 0.98, y: 6 }}
				transition={{ duration: 0.22, ease: "easeOut" }}
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
			</motion.section>
		</div>
	);
}
