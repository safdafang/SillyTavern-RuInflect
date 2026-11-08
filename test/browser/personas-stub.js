export let user_avatar = 'anna.png';
export function __setAvatar(a) {
    user_avatar = a;
}
export async function retriggerFirstMessageOnEmptyChat() {
    window.__retriggered = (window.__retriggered || 0) + 1;
}
