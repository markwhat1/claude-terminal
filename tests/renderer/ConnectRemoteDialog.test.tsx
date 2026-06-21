// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import ConnectRemoteDialog from '../../src/renderer/components/ConnectRemoteDialog';

describe('ConnectRemoteDialog', () => {
  it('prefills the URL and disables Connect until a 6-char code', () => {
    render(<ConnectRemoteDialog defaultUrl="https://h.ts.net" onConnect={vi.fn()} onCancel={vi.fn()} />);
    const urlInput = screen.getByPlaceholderText(/your-tailnet/i) as HTMLInputElement;
    expect(urlInput.value).toBe('https://h.ts.net');
    const connect = screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
  });

  it('normalizes a scheme-less host and reports url, code, remember', () => {
    const onConnect = vi.fn();
    render(<ConnectRemoteDialog defaultUrl="cad-doctor.crested-ruler.ts.net" onConnect={onConnect} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'abc234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledWith('https://cad-doctor.crested-ruler.ts.net', 'ABC234', true);
  });

  it('offers Forget when a host is remembered and invokes onForget', () => {
    const onForget = vi.fn();
    render(<ConnectRemoteDialog defaultUrl="https://h.ts.net" onConnect={vi.fn()} onCancel={vi.fn()} onForget={onForget} />);
    fireEvent.click(screen.getByText('Forget this host'));
    expect(onForget).toHaveBeenCalled();
  });
});
